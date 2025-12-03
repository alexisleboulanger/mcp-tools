import { FastMCP, ServerOptions } from 'fastmcp';
import { z } from 'zod';
import dotenv from 'dotenv';
import axios, { AxiosError, AxiosInstance } from 'axios';
import http from 'http';
import open from 'open';

dotenv.config();

// We keep a mutable activeBoardId so the server can switch boards at runtime without restart.
let activeBoardId = process.env.MIRO_BOARD_ID;
const port = process.env.PORT ? parseInt(process.env.PORT) : 8899;

// Will be initialised during bootstrap once we have a token.
let miroClient: AxiosInstance;

function normalizeRedirectUri(uri: string): string {
    try {
        // Allow both plain and percent-encoded URIs (as in the .http file).
        if (uri.includes('%')) {
            return decodeURIComponent(uri);
        }
    } catch {
        // Fall through to raw value on decode errors.
    }
    return uri;
}

async function getAuthCodeViaBrowser(clientId: string, redirectUri: string, scope: string): Promise<string> {
    const redirect = new URL(redirectUri);
    const expectedPath = redirect.pathname || '/';
    const port = redirect.port ? parseInt(redirect.port, 10) : 80;
    const hostname = redirect.hostname || 'localhost';
    const state = 'mcp-' + Date.now().toString(36);

    const authUrl = new URL('https://miro.com/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirect.toString());
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    console.log('\n[miro-oauth] Open this URL in your browser to authorize access:');
    console.log(authUrl.toString());

    try {
        // Try to open the system browser automatically.
        await open(authUrl.toString());
    } catch (e) {
        console.warn('[miro-oauth] Could not automatically open browser. Please open the URL above manually.');
    }

    return new Promise<string>((resolve, reject) => {
        const server = http.createServer((req, res) => {
            if (!req.url) return;

            const reqUrl = new URL(req.url, redirect.toString());

            if (reqUrl.pathname !== expectedPath) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const returnedState = reqUrl.searchParams.get('state');
            if (returnedState && returnedState !== state) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid state parameter.');
                server.close();
                return reject(new Error('State mismatch in OAuth callback'));
            }

            const errorParam = reqUrl.searchParams.get('error');
            if (errorParam) {
                const desc = reqUrl.searchParams.get('error_description') || '';
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Authorization failed: ' + errorParam);
                server.close();
                return reject(new Error('Authorization failed: ' + errorParam + ' ' + desc));
            }

            const code = reqUrl.searchParams.get('code');
            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Missing authorization code.');
                server.close();
                return reject(new Error('Missing authorization code in callback'));
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Miro authorization complete</h1><p>You can close this window and return to your MCP client.</p></body></html>');

            server.close();
            console.log('[miro-oauth] Received authorization code from browser callback.');
            resolve(code);
        });

        server.listen(port, hostname, () => {
            console.log(`[miro-oauth] Listening for OAuth callback on http://${hostname}:${port}${expectedPath}`);
        });

        server.on('error', (err) => {
            console.error('[miro-oauth] Local callback server error:', err);
            reject(err);
        });
    });
}

/**
 * Resolve a Miro API access token:
 * 1) Prefer MIRO_API_TOKEN if already set.
 * 2) Otherwise, use OAuth2 (MIRO_CLIENT_ID, MIRO_CLIENT_SECRET, MIRO_REDIRECT_URI) to drive
 *    the interactive browser flow, capture the authorization code, and exchange it for a token.
 */
async function resolveMiroToken(): Promise<string> {
    const direct = process.env.MIRO_API_TOKEN?.trim();
    if (direct) return direct;

    const clientId = process.env.MIRO_CLIENT_ID?.trim();
    const clientSecret = process.env.MIRO_CLIENT_SECRET?.trim();
    const redirectUriRaw = process.env.MIRO_REDIRECT_URI?.trim();
    const redirectUri = redirectUriRaw ? normalizeRedirectUri(redirectUriRaw) : undefined;
    const scope = process.env.MIRO_SCOPE?.trim() || 'boards:read boards:write';

    if (!clientId || !clientSecret || !redirectUri) {
        console.error(
            'MIRO_API_TOKEN is not set and OAuth2 env vars are incomplete. ' +
            'Set MIRO_CLIENT_ID, MIRO_CLIENT_SECRET, MIRO_REDIRECT_URI (and optionally MIRO_SCOPE), ' +
            'or provide MIRO_API_TOKEN directly.'
        );
        process.exit(1);
    }

    let authCode = process.env.MIRO_AUTH_CODE?.trim();

    if (!authCode) {
        console.log('[miro-oauth] No MIRO_AUTH_CODE provided. Starting interactive OAuth2 flow...');
        try {
            authCode = await getAuthCodeViaBrowser(clientId, redirectUri, scope);
            // Persist within the current process for any subsequent use.
            process.env.MIRO_AUTH_CODE = authCode;
        } catch (e) {
            console.error('[miro-oauth] Failed to obtain authorization code from browser:', (e as Error).message);
            process.exit(1);
        }
    }

    try {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
        });

        const resp = await axios.post(
            'https://api.miro.com/v1/oauth/token',
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = (resp.data as any).access_token as string | undefined;
        if (!accessToken) {
            console.error('[miro-oauth] OAuth2 response did not contain access_token');
            process.exit(1);
        }

        console.log('[miro-oauth] Obtained Miro access token via OAuth2.');
        // Make available to the rest of the process.
        process.env.MIRO_API_TOKEN = accessToken;
        return accessToken;
    } catch (e) {
        console.error(
            '[miro-oauth] Failed to exchange authorization code for access token:',
            (e as Error).message
        );
        process.exit(1);
    }
}

const server = new FastMCP({
    name: 'Miro MCP Server (Explicit)',
    version: '0.2.0',
    onToolCall: (toolName: string, params: Record<string, unknown>) => {
        console.log('\n=== Tool Call Details ===');
        console.log(`Tool Name: ${toolName}`);
        console.log('Parameters:', JSON.stringify(params, null, 2));
        console.log('=====================\n');
    }
} as ServerOptions<undefined>);


// --- Helper Function to Format API Responses/Errors ---
function formatApiResponse(response: unknown): string {
    return JSON.stringify(response, null, 2);
}

function formatApiError(error: unknown): string {
    console.error(`API Call Failed: ${(error as Error).message}`);
    const axiosError = error as AxiosError;
    let errorMessage = `Miro API Request Error: ${(error as Error).message}`;
    if (axiosError.response) {
        console.error(`Status: ${axiosError.response.status}`);
        const responseData = JSON.stringify(axiosError.response.data);
        console.error(`Data: ${responseData}`);
        errorMessage = `Miro API Error (${axiosError.response.status}): ${responseData}`;
    }
     // Throwing the error string so FastMCP can handle it
    throw new Error(errorMessage);
}

// --- Lightweight HTML -> Plain Text Helper (mirrors miro_fetch.py behaviour) ---
function htmlToPlain(textHtml?: string | null): string {
    if (!textHtml) return '';
    let txt = String(textHtml);

    // Decode a few common HTML entities (similar spirit to Python html.unescape).
    const entityMap: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
    };
    txt = txt.replace(/&(amp|lt|gt|quot|#39);/g, (m) => entityMap[m] ?? m);

    // Very light cleaning: paragraph & line-break tags -> newlines.
    txt = txt.replace(/<br\s*\/?>(\s*)/gi, '\n');
    txt = txt.replace(/<p>/gi, '').replace(/<\/p>/gi, '\n');

    // Strip any remaining tags.
    txt = txt.replace(/<[^>]+>/g, '');

    // Normalise whitespace.
    txt = txt.replace(/\s+/g, ' ').trim();
    return txt;
}

function plainSnippet(textHtml?: string | null, maxLen = 2000): string {
    const base = htmlToPlain(textHtml);
    if (base.length <= maxLen) return base;
    return base.slice(0, maxLen);
}


// --- Common Schemas for Items ---

const PositionChangeSchema = z.object({
    x: z.number().optional().describe('X-axis coordinate.'),
    y: z.number().optional().describe('Y-axis coordinate.'),
    origin: z.enum(['center']).optional().describe('Origin point for coordinates.'),
    relativeTo: z.enum(['canvas_center', 'parent_top_left']).optional().describe('Coordinate system reference.')
}).describe('Position of the item.');

const GeometrySchema = z.object({
     width: z.number().optional().describe('Width in pixels.'),
     height: z.number().optional().describe('Height in pixels.'),
     rotation: z.number().optional().describe('Rotation angle in degrees.')
 }).describe('Dimensions and rotation.');

const WidthOnlyGeometrySchema = z.object({
    width: z.number().optional().describe('Width in pixels. Height is automatic.'),
    rotation: z.number().optional().describe('Rotation angle in degrees.')
}).describe('Width and rotation (height adjusts automatically).');

const FixedRatioGeometrySchema = z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    rotation: z.number().optional().describe('Rotation angle in degrees.')
}).refine(data => !(data.width && data.height), {
    message: 'Cannot set both width and height for fixed ratio geometry.',
    path: ['height']
}).describe('Dimensions (fixed ratio) and rotation.');

const FixedRatioNoRotationGeometrySchema = z.object({
    width: z.number().optional(),
    height: z.number().optional(),
}).refine(data => !(data.width && data.height), {
    message: 'Cannot set both width and height for fixed ratio geometry.',
    path: ['height']
}).describe('Dimensions (fixed ratio, no rotation).');


// --- Tool Definitions ---

// Helper to resolve a board id from tool args (optional override) or fall back to activeBoardId.
function resolveBoardId(args?: Record<string, unknown>): string {
    const candidate = args && typeof args.board_id === 'string' && (args.board_id as string).trim() ? (args.board_id as string).trim() : undefined;
    if (candidate) return candidate;
    if (!activeBoardId) {
        throw new Error('No active board set. Use set_active_board or provide board_id parameter.');
    }
    return activeBoardId;
}

// Tool to set the active board id at runtime.
server.addTool({
    name: 'set_active_board',
    description: 'Sets a new default active board ID after validating access. Subsequent calls without board_id use this board.',
    parameters: z.object({
        board_id: z.string().min(3).describe('Miro board ID to become the new active default.')
    }),
    execute: async (args) => {
        const testId = args.board_id.trim();
        try {
            const resp = await miroClient.get(`/v2/boards/${testId}`);
            activeBoardId = testId;
            return formatApiResponse({ message: 'Active board updated successfully.', activeBoardId, board: resp.data });
        } catch (e) {
            return formatApiError(e);
        }
    }
});

// Tool to retrieve the current active board id.
server.addTool({
    name: 'get_active_board',
    description: 'Returns the current active board ID and basic metadata (if resolvable).',
    parameters: z.object({}),
    execute: async () => {
        if (!activeBoardId) return formatApiResponse({ activeBoardId: null, message: 'No active board set.' });
        try {
            const resp = await miroClient.get(`/v2/boards/${activeBoardId}`);
            return formatApiResponse({ activeBoardId, board: resp.data });
        } catch (e) {
            return formatApiResponse({ activeBoardId, error: (e as Error).message });
        }
    }
});

// GET /v2/boards/{board_id} - get_specific_board (now supports optional board_id override)
server.addTool({
    name: 'get_specific_board',
    description: 'Retrieves information about a board. Uses active board unless board_id provided.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}`;
        console.log(`Executing get_specific_board: GET ${url}`);
        try {
            const response = await miroClient.get(url);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// PATCH /v2/boards/{board_id} - update_board
server.addTool({
    name: 'update_board',
    description: 'Updates a board (active by default, can override).',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        name: z.string().min(1).max(60).optional().describe('Name for the board.'),
        description: z.string().min(0).max(300).optional().describe('Description of the board.'),
        policy: z.object({
             permissionsPolicy: z.object({
                collaborationToolsStartAccess: z.enum(['all_editors', 'board_owners_and_coowners']).optional().describe('Defines who can start/stop collaboration tools.'),
                copyAccess: z.enum(['anyone', 'team_members', 'team_editors', 'board_owner']).optional().describe('Defines who can copy the board/content.'),
                sharingAccess: z.enum(['team_members_with_editing_rights', 'owner_and_coowners']).optional().describe('Defines who can change sharing/invite users.')
            }).optional(),
            sharingPolicy: z.object({
                access: z.enum(['private', 'view', 'comment', 'edit']).optional().describe('Defines the public-level access to the board.'),
                 inviteToAccountAndBoardLinkAccess: z.enum(['viewer', 'commenter', 'editor', 'no_access']).optional().describe('Defines the user role when inviting via link.'),
                 organizationAccess: z.enum(['private', 'view', 'comment', 'edit']).optional().describe('Defines the organization-level access.'),
                 teamAccess: z.enum(['private', 'view', 'comment', 'edit']).optional().describe('Defines the team-level access.')
            }).optional()
        }).optional().describe('Board policy settings.'),
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...body } = args as any;
        const url = `/v2/boards/${boardId}`;
        console.log(`Executing update_board: PATCH ${url}`);
        console.log(`With body: ${JSON.stringify(body)}`);
        try {
            const response = await miroClient.patch(url, body);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});


// GET /v2/boards/{board_id}/items - get_items
server.addTool({
    name: 'get_items',
    description: 'Retrieves a list of items on the specified or active board. Supports filtering by type and pagination.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        limit: z.string().optional().describe('Maximum number of results per call (10-50). Default: 10.'),
        type: z.enum(['text', 'shape', 'sticky_note', 'image', 'document', 'card', 'app_card', 'preview', 'frame', 'embed']).optional().describe('Filter items by type.'),
        cursor: z.string().optional().describe('Pagination cursor for the next set of results.'),
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...query } = args as any;
        const url = `/v2/boards/${boardId}/items`;
        console.log(`Executing get_items: GET ${url}`);
        console.log(`With query params: ${JSON.stringify(query)}`);
        try {
            const response = await miroClient.get(url, { params: query });
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});


// --- Generic Item Modification Endpoints ---

// PATCH /v2/boards/{board_id}/items/{item_id} - update_item_position_or_parent
server.addTool({
    name: 'update_item_position_or_parent',
    description: 'Updates the position or parent of a specific item on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the item to update.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/items/${item_id}`;
        console.log(`Executing update_item_position_or_parent: PATCH ${url}`);
        const patchData = {
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const response = await miroClient.patch(url, patchData);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/items/{item_id} - delete_item
server.addTool({
    name: 'delete_item',
    description: 'Deletes a specific item (sticky note, text, shape, card, document, embed, image, app card) from the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the item to delete.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/items/${(args as any).item_id}`;
        console.log(`Executing generic delete_item: DELETE ${url}`);
        try {
            const response = await miroClient.delete(url);
             console.log(`API Call Successful: ${response.status}`);
             // 204 No Content on successful deletion
             return `Item ${args.item_id} deleted successfully (Status: ${response.status}).`;
        } catch (error) {
            return formatApiError(error);
        }
    },
});


// --- Sticky Note Endpoints ---

const StickyNoteDataSchema = z.object({
    content: z.string().optional().describe('The text content of the sticky note.'),
    shape: z.enum(['square', 'rectangle']).optional().default('square').describe('Shape of the sticky note.')
});

const StickyNoteStyleSchema = z.object({
    fillColor: z.enum(['gray', 'light_yellow', 'yellow', 'orange', 'light_green', 'green', 'dark_green', 'cyan', 'light_pink', 'pink', 'violet', 'red', 'light_blue', 'blue', 'dark_blue', 'black']).optional().describe('Background color.'),
    textAlign: z.enum(['left', 'right', 'center']).optional().default('center').describe('Horizontal text alignment.'),
    textAlignVertical: z.enum(['top', 'middle', 'bottom']).optional().default('top').describe('Vertical text alignment.'),
});

// POST /v2/boards/{board_id}/sticky_notes - create_sticky_note_item
server.addTool({
    name: 'create_sticky_note_item',
    description: 'Adds a sticky note item to the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: StickyNoteDataSchema.describe('Content and shape of the sticky note.'),
        style: StickyNoteStyleSchema.optional().describe('Styling options for the sticky note.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        // Geometry for sticky notes is usually fixed ratio, allow basic overrides
        geometry: z.object({ width: z.number().optional(), height: z.number().optional() }).optional().describe('Initial dimensions (optional, often auto-sized).')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/sticky_notes`;
        console.log(`Executing create_sticky_note_item: POST ${url}`);
         // Miro requires wrapping data/style/position/geometry in the request body
         const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.style && { style: rest.style }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
         };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/sticky_notes/{item_id} - get_sticky_note_item
server.addTool({
    name: 'get_sticky_note_item',
    description: 'Retrieves information for a specific sticky note item on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the sticky note item.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/sticky_notes/${(args as any).item_id}`;
        console.log(`Executing get_sticky_note_item: GET ${url}`);
        try {
            const response = await miroClient.get(url);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// PATCH /v2/boards/{board_id}/sticky_notes/{item_id} - update_sticky_note_item
server.addTool({
    name: 'update_sticky_note_item',
    description: 'Updates a sticky note item on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the sticky note to update.'),
        data: StickyNoteDataSchema.deepPartial().optional().describe('Updated content or shape.'),
        style: StickyNoteStyleSchema.deepPartial().optional().describe('Updated styling.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: z.object({ width: z.number().optional(), height: z.number().optional() }).optional().describe('Updated dimensions.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/sticky_notes/${item_id}`;
        console.log(`Executing update_sticky_note_item: PATCH ${url}`);
         // Miro requires wrapping data/style/position/geometry in the request body
         const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.style && { style: requestBody.style }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
         };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
             // Ensure we send an empty object if no actual changes are provided,
             // otherwise Miro might reject the request. Although typically the
             // MCP client wouldn't call with no changes.
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/sticky_notes/{item_id} - delete_sticky_note_item
// Covered by generic delete_item


// --- Text Endpoints ---

const TextDataSchema = z.object({
    content: z.string().describe('The text content.')
});

const TextStyleSchema = z.object({
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Background hex color.'),
    fillOpacity: z.number().min(0).max(1).optional().describe('Background opacity (0.0-1.0).'),
    fontFamily: z.enum(['arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 'plex_mono', 'spoof', 'tiempos_text', 'formular']).optional().describe('Font family.'),
    fontSize: z.number().min(1).optional().describe('Font size in dp.'), // Assuming number based on example usage elsewhere
    textAlign: z.enum(['left', 'right', 'center']).optional().default('left').describe('Horizontal text alignment.'), // Default likely left for text
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Text hex color.')
});

// POST /v2/boards/{board_id}/texts - create_text_item
server.addTool({
    name: 'create_text_item',
    description: 'Adds a text item to the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: TextDataSchema.describe('The text content.'),
        style: TextStyleSchema.optional().describe('Styling options.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: WidthOnlyGeometrySchema.optional().describe('Width and rotation.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/texts`;
        console.log(`Executing create_text_item: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.style && { style: rest.style }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/texts/{item_id} - get_text_item
server.addTool({
    name: 'get_text_item',
    description: 'Retrieves information for a specific text item on the current board.',
     parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the text item.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/texts/${(args as any).item_id}`;
        console.log(`Executing get_text_item: GET ${url}`);
        try {
            const response = await miroClient.get(url);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// PATCH /v2/boards/{board_id}/texts/{item_id} - update_text_item
server.addTool({
    name: 'update_text_item',
    description: 'Updates a text item on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the text item to update.'),
        data: TextDataSchema.deepPartial().optional().describe('Updated text content.'),
        style: TextStyleSchema.deepPartial().optional().describe('Updated styling.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: WidthOnlyGeometrySchema.optional().describe('Updated width or rotation.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/texts/${item_id}`;
        console.log(`Executing update_text_item: PATCH ${url}`);
        const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.style && { style: requestBody.style }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/texts/{item_id} - delete_text_item
// Covered by generic delete_item


// --- Shape Endpoints ---

const ShapeDataSchema = z.object({
    content: z.string().optional().describe('Text content within the shape.'),
    shape: z.enum(['rectangle', 'round_rectangle', 'circle', 'triangle', 'rhombus', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 'wedge_round_rectangle_callout', 'star', 'flow_chart_predefined_process', 'cloud', 'cross', 'can', 'right_arrow', 'left_arrow', 'left_right_arrow', 'left_brace', 'right_brace']).optional().default('rectangle').describe('The geometric shape type.')
});

const ShapeStyleSchema = z.object({
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Fill hex color.'),
    fillOpacity: z.number().min(0).max(1).optional().describe('Fill opacity (0.0-1.0).'),
    fontFamily: z.enum(['arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 'plex_mono', 'spoof', 'tiempos_text', 'formular']).optional().describe('Font family for text inside.'),
    fontSize: z.number().min(10).max(288).optional().describe('Font size (dp).'), // Assuming number
    borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Border hex color.'),
    borderOpacity: z.number().min(0).max(1).optional().describe('Border opacity (0.0-1.0).'),
    borderStyle: z.enum(['normal', 'dotted', 'dashed']).optional().describe('Border line style.'),
    borderWidth: z.number().min(1).max(24).optional().describe('Border thickness (dp).'), // Assuming number
    textAlign: z.enum(['left', 'right', 'center']).optional().default('center').describe('Horizontal text alignment.'),
    textAlignVertical: z.enum(['top', 'middle', 'bottom']).optional().default('middle').describe('Vertical text alignment.'), // Default middle for shapes usually
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Text hex color.')
});

// POST /v2/boards/{board_id}/shapes - create_shape_item
server.addTool({
    name: 'create_shape_item',
    description: 'Adds a shape item to the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: ShapeDataSchema.describe('Content and shape type.'),
        style: ShapeStyleSchema.optional().describe('Styling options.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: GeometrySchema.optional().describe('Dimensions and rotation.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/shapes`;
        console.log(`Executing create_shape_item: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.style && { style: rest.style }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/shapes/{item_id} - get_shape_item
server.addTool({
    name: 'get_shape_item',
    description: 'Retrieves information for a specific shape item on the current board.',
     parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the shape item.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/shapes/${(args as any).item_id}`;
        console.log(`Executing get_shape_item: GET ${url}`);
        try {
            const response = await miroClient.get(url);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// PATCH /v2/boards/{board_id}/shapes/{item_id} - update_shape_item
server.addTool({
    name: 'update_shape_item',
    description: 'Updates a shape item on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the shape item to update.'),
        data: ShapeDataSchema.deepPartial().optional().describe('Updated content or shape type.'),
        style: ShapeStyleSchema.deepPartial().optional().describe('Updated styling.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: GeometrySchema.optional().describe('Updated dimensions or rotation.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/shapes/${item_id}`;
        console.log(`Executing update_shape_item: PATCH ${url}`);
         const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.style && { style: requestBody.style }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
         };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/shapes/{item_id} - delete_shape_item
// Covered by generic delete_item

// --- Card Endpoints ---

const CardDataSchema = z.object({
    title: z.string().optional().default('sample card item').describe('Header text for the card.'),
    description: z.string().optional().describe('Description text for the card.'),
    dueDate: z.string().datetime({ offset: true }).optional().describe('Due date in ISO 8601 format (UTC).'),
    assigneeId: z.string().optional().describe('User ID for the assignee.')
});

const CardStyleSchema = z.object({
    cardTheme: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color for the card border. Default: #2d9bf0.')
});

// POST /v2/boards/{board_id}/cards - create_card_item
server.addTool({
    name: 'create_card_item',
    description: 'Adds a card item to the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: CardDataSchema.describe('Data for the card.'),
        style: CardStyleSchema.optional().describe('Styling for the card.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: GeometrySchema.optional().describe('Dimensions and rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/cards`;
        console.log(`Executing create_card_item: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.style && { style: rest.style }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
            ...(rest.parent && { parent: rest.parent }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/cards/{item_id} - get_card_item
server.addTool({
    name: 'get_card_item',
    description: 'Retrieves information for a specific card item on the current board.',
     parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the card item.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/cards/${(args as any).item_id}`;
        console.log(`Executing get_card_item: GET ${url}`);
        try {
            const response = await miroClient.get(url);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// PATCH /v2/boards/{board_id}/cards/{item_id} - update_card_item
server.addTool({
    name: 'update_card_item',
    description: 'Updates a card item on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the card to update.'),
        data: CardDataSchema.deepPartial().optional().describe('Updated card data.'),
        style: CardStyleSchema.deepPartial().optional().describe('Updated card style.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: GeometrySchema.optional().describe('Updated dimensions or rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/cards/${item_id}`;
        console.log(`Executing update_card_item: PATCH ${url}`);
        const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.style && { style: requestBody.style }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/cards/{item_id} - delete_card_item
// Covered by generic delete_item


// --- Connector Endpoints ---

const RelativeOffsetSchema = z.object({
    x: z.string().regex(/^\d{1,3}(\.\d+)?%$/).describe('Relative X position (e.g., "50%").'),
    y: z.string().regex(/^\d{1,3}(\.\d+)?%$/).describe('Relative Y position (e.g., "0%").')
}).describe('Relative position on item (0%-100%).');

const ItemConnectionSchema = z.object({
    id: z.string().describe('Item ID to connect to.'),
    position: RelativeOffsetSchema.optional().describe('Relative attachment point.'),
    snapTo: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional().describe('Side to snap connection to (overrides position).')
});

const CaptionSchema = z.object({
    content: z.string().max(200).describe('Caption text (supports inline HTML).'),
    position: z.string().regex(/^\d{1,3}(\.\d+)?%$/).optional().describe('Relative position along connector (0%-100%, default 50%).'),
    textAlignVertical: z.enum(['top', 'middle', 'bottom']).optional().describe('Vertical alignment relative to connector.')
});

const ConnectorStyleSchema = z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Caption text hex color.'),
    endStrokeCap: z.enum(['none', 'stealth', 'rounded_stealth', 'diamond', 'filled_diamond', 'oval', 'filled_oval', 'arrow', 'triangle', 'filled_triangle', 'erd_one', 'erd_many', 'erd_only_one', 'erd_zero_or_one', 'erd_one_or_many', 'erd_zero_or_many', 'unknown']).optional().describe('Decoration for the end of the connector.'),
    fontSize: z.string().optional().describe('Caption font size (dp).'), // String in spec
    startStrokeCap: z.enum(['none', 'stealth', 'rounded_stealth', 'diamond', 'filled_diamond', 'oval', 'filled_oval', 'arrow', 'triangle', 'filled_triangle', 'erd_one', 'erd_many', 'erd_only_one', 'erd_zero_or_one', 'erd_one_or_many', 'erd_zero_or_many', 'unknown']).optional().describe('Decoration for the start of the connector.'),
    strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Connector line hex color.'),
    strokeStyle: z.enum(['normal', 'dotted', 'dashed']).optional().describe('Connector line pattern.'),
    strokeWidth: z.string().optional().describe('Connector line thickness (dp).'), // String in spec
    textOrientation: z.enum(['horizontal', 'aligned']).optional().describe('Caption orientation relative to the line.')
});

// POST /v2/boards/{board_id}/connectors - create_connector
server.addTool({
    name: 'create_connector',
    description: 'Adds a connector between two items on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        startItem: ItemConnectionSchema.describe('The item where the connector starts.'),
        endItem: ItemConnectionSchema.describe('The item where the connector ends.'),
        shape: z.enum(['straight', 'elbowed', 'curved']).optional().default('curved').describe('Path type of the connector line.'),
        captions: z.array(CaptionSchema).max(20).optional().describe('Text captions to display on the connector.'),
        style: ConnectorStyleSchema.optional().describe('Styling options for the connector.')
    }).refine(data => data.startItem.id !== data.endItem.id, {
        message: 'startItem.id must be different from endItem.id',
        path: ['endItem', 'id'], // Report error on endItem.id
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...body } = args as any;
        const url = `/v2/boards/${boardId}/connectors`;
        console.log(`Executing create_connector: POST ${url}`);
        console.log(`With body: ${JSON.stringify(body)}`);
        try {
            const response = await miroClient.post(url, body);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/connectors - get_connectors
server.addTool({
    name: 'get_connectors',
    description: 'Retrieves a list of connectors for the current board. Supports pagination.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        limit: z.string().optional().describe('Maximum number of results per call (10-50). Default: 10.'),
        cursor: z.string().optional().describe('Pagination cursor for the next set of results.'),
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...query } = args as any;
        const url = `/v2/boards/${boardId}/connectors`;
        console.log(`Executing get_connectors: GET ${url}`);
        console.log(`With query params: ${JSON.stringify(query)}`);
        try {
            const response = await miroClient.get(url, { params: query });
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});


// GET /v2/boards/{board_id}/connectors/{connector_id} - get_connector
server.addTool({
    name: 'get_connector',
    description: 'Retrieves information for a specific connector on the current board.',
     parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        connector_id: z.string().describe('Unique identifier (ID) of the connector.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/connectors/${(args as any).connector_id}`;
        console.log(`Executing get_connector: GET ${url}`);
        try {
            const response = await miroClient.get(url);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// PATCH /v2/boards/{board_id}/connectors/{connector_id} - update_connector
server.addTool({
    name: 'update_connector',
    description: 'Updates a connector on the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        connector_id: z.string().describe('Unique identifier (ID) of the connector to update.'),
        startItem: ItemConnectionSchema.deepPartial().optional().describe('Updated start item connection.'),
        endItem: ItemConnectionSchema.deepPartial().optional().describe('Updated end item connection.'),
        shape: z.enum(['straight', 'elbowed', 'curved']).optional().describe('Updated path type.'),
        captions: z.array(CaptionSchema).max(20).optional().describe('Updated captions.'),
        style: ConnectorStyleSchema.deepPartial().optional().describe('Updated styling.')
    }).passthrough() // Allow potential unknown fields
    .refine(data => !data.startItem?.id || !data.endItem?.id || data.startItem.id !== data.endItem.id, {
        message: 'startItem.id must be different from endItem.id if both are provided',
        path: ['endItem', 'id'],
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, connector_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/connectors/${connector_id}`;
        console.log(`Executing update_connector: PATCH ${url}`);
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const bodyToSend = Object.keys(requestBody).length > 0 ? requestBody : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/connectors/{connector_id} - delete_connector
server.addTool({
    name: 'delete_connector',
    description: 'Deletes a specific connector from the current board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        connector_id: z.string().describe('Unique identifier (ID) of the connector to delete.')
    }),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const url = `/v2/boards/${boardId}/connectors/${(args as any).connector_id}`;
        console.log(`Executing delete_connector: DELETE ${url}`);
        try {
            const response = await miroClient.delete(url);
             console.log(`API Call Successful: ${response.status}`);
             return `Connector ${args.connector_id} deleted successfully (Status: ${response.status}).`;
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// --- Document Endpoints ---

const DocumentUrlDataSchema = z.object({
    url: z.string().url().describe('URL where the document is hosted.'),
    title: z.string().optional().describe('Header text for the document item.')
});

// POST /v2/boards/{board_id}/documents - create_document_item_using_url
server.addTool({
    name: 'create_document_item_using_url',
    description: 'Adds a document item to the board using a URL.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: DocumentUrlDataSchema.describe('URL and title of the document.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: FixedRatioGeometrySchema.optional().describe('Initial dimensions (fixed ratio) and rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/documents`;
        console.log(`Executing create_document_item_using_url: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
            ...(rest.parent && { parent: rest.parent }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/documents/{item_id} - get_document_item
// Covered by generic get_specific_item

// PATCH /v2/boards/{board_id}/documents/{item_id} - update_document_item_using_url
server.addTool({
    name: 'update_document_item_using_url',
    description: 'Updates a document item on the board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the document to update.'),
        data: DocumentUrlDataSchema.deepPartial().optional().describe('Updated URL or title.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: FixedRatioGeometrySchema.optional().describe('Updated dimensions or rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/documents/${item_id}`;
        console.log(`Executing update_document_item_using_url: PATCH ${url}`);
        const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/documents/{item_id} - delete_document_item
// Covered by generic delete_item

// --- Embed Endpoints ---

const EmbedUrlDataSchema = z.object({
    url: z.string().url().describe('URL of the content to embed (HTTP/HTTPS).'),
    mode: z.enum(['inline', 'modal']).optional().describe('Display mode (inline or modal).'),
    previewUrl: z.string().url().optional().describe('URL for a preview image.')
});

// POST /v2/boards/{board_id}/embeds - create_embed_item
server.addTool({
    name: 'create_embed_item',
    description: 'Adds an embed item (e.g., video, website) to the board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: EmbedUrlDataSchema.describe('URL and display options for the embed.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: FixedRatioNoRotationGeometrySchema.optional().describe('Initial dimensions (fixed ratio, no rotation).'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/embeds`;
        console.log(`Executing create_embed_item: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
            ...(rest.parent && { parent: rest.parent }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/embeds/{item_id} - get_embed_item
// Covered by generic get_specific_item

// PATCH /v2/boards/{board_id}/embeds/{item_id} - update_embed_item
server.addTool({
    name: 'update_embed_item',
    description: 'Updates an embed item on the board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the embed to update.'),
        data: EmbedUrlDataSchema.deepPartial().optional().describe('Updated URL, mode, or preview URL.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: FixedRatioNoRotationGeometrySchema.optional().describe('Updated dimensions.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/embeds/${item_id}`;
        console.log(`Executing update_embed_item: PATCH ${url}`);
        const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/embeds/{item_id} - delete_embed_item
// Covered by generic delete_item

// --- Image Endpoints ---

const ImageUrlDataSchema = z.object({
    url: z.string().url().describe('URL of the image.'),
    title: z.string().optional().describe('Header text for the image item.'),
    altText: z.string().optional().describe('Alt text for the image.')
});

// POST /v2/boards/{board_id}/images - create_image_item_using_url
server.addTool({
    name: 'create_image_item_using_url',
    description: 'Adds an image item to the board using a URL.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: ImageUrlDataSchema.describe('URL, title, and alt text for the image.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: FixedRatioGeometrySchema.optional().describe('Initial dimensions (fixed ratio) and rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/images`;
        console.log(`Executing create_image_item_using_url: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
            ...(rest.parent && { parent: rest.parent }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/images/{item_id} - get_image_item
// Covered by generic get_specific_item

// PATCH /v2/boards/{board_id}/images/{item_id} - update_image_item_using_url
server.addTool({
    name: 'update_image_item_using_url',
    description: 'Updates an image item on the board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the image to update.'),
        data: ImageUrlDataSchema.deepPartial().optional().describe('Updated URL, title, or alt text.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: FixedRatioGeometrySchema.optional().describe('Updated dimensions or rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/images/${item_id}`;
        console.log(`Executing update_image_item_using_url: PATCH ${url}`);
        const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/images/{item_id} - delete_image_item
// Covered by generic delete_item

// --- App Card Endpoints ---

const CustomFieldSchema = z.object({
    value: z.string().optional().describe('Data value of the field.'),
    tooltip: z.string().optional().describe('Tooltip text.'),
    iconUrl: z.string().url().optional().describe('URL for an icon image (HTTPS).'),
    iconShape: z.enum(['round', 'square']).optional().default('round').describe('Shape of the icon.'),
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Background hex color of the field.'),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Text hex color.')
});

const AppCardDataSchema = z.object({
    title: z.string().optional().default('sample app card item').describe('Header text for the app card.'),
    description: z.string().optional().describe('Description text.'),
    fields: z.array(CustomFieldSchema).optional().describe('Array of custom fields displayed on the card.'),
    status: z.enum(['disconnected', 'connected', 'disabled']).optional().default('disconnected').describe('Connection status with the source.')
    // owned is read-only
});

const AppCardStyleSchema = z.object({
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color for the app card border. Default: #2d9bf0.')
});

// POST /v2/boards/{board_id}/app_cards - create_app_card_item
server.addTool({
    name: 'create_app_card_item',
    description: 'Adds an app card item to the board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        data: AppCardDataSchema.describe('Data for the app card.'),
        style: AppCardStyleSchema.optional().describe('Styling for the app card.'),
        position: PositionChangeSchema.optional().describe('Position on the board.'),
        geometry: GeometrySchema.optional().describe('Dimensions and rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, ...rest } = args as any;
        const url = `/v2/boards/${boardId}/app_cards`;
        console.log(`Executing create_app_card_item: POST ${url}`);
        const requestBody = {
            ...(rest.data && { data: rest.data }),
            ...(rest.style && { style: rest.style }),
            ...(rest.position && { position: rest.position }),
            ...(rest.geometry && { geometry: rest.geometry }),
            ...(rest.parent && { parent: rest.parent }),
        };
        console.log(`With body: ${JSON.stringify(requestBody)}`);
        try {
            const response = await miroClient.post(url, requestBody);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// GET /v2/boards/{board_id}/app_cards/{item_id} - get_app_card_item
// Covered by generic get_specific_item

// PATCH /v2/boards/{board_id}/app_cards/{item_id} - update_app_card_item
server.addTool({
    name: 'update_app_card_item',
    description: 'Updates an app card item on the board.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        item_id: z.string().describe('Unique identifier (ID) of the app card to update.'),
        data: AppCardDataSchema.deepPartial().optional().describe('Updated app card data.'),
        style: AppCardStyleSchema.deepPartial().optional().describe('Updated app card style.'),
        position: PositionChangeSchema.optional().describe('Updated position.'),
        geometry: GeometrySchema.optional().describe('Updated dimensions or rotation.'),
        parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.')
    }).passthrough(),
    execute: async (args) => {
        const boardId = resolveBoardId(args);
        const { board_id, item_id, ...requestBody } = args as any;
        const url = `/v2/boards/${boardId}/app_cards/${item_id}`;
        console.log(`Executing update_app_card_item: PATCH ${url}`);
        const patchData = {
            ...(requestBody.data && { data: requestBody.data }),
            ...(requestBody.style && { style: requestBody.style }),
            ...(requestBody.position && { position: requestBody.position }),
            ...(requestBody.geometry && { geometry: requestBody.geometry }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const bodyToSend = Object.keys(patchData).length > 0 ? patchData : {};
            const response = await miroClient.patch(url, bodyToSend);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
});

// DELETE /v2/boards/{board_id}/app_cards/{item_id} - delete_app_card_item
// Covered by generic delete_item


// --- Start the server ---
// --- Aggregation / Summary Tools ---
server.addTool({
    name: 'summarize_board',
    description: 'Returns board metadata plus counts of all items by type and optional sample text/title snippets.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        includeSamples: z.boolean().optional().default(true).describe('Include sample snippets for each item type.'),
        maxSamplesPerType: z.number().int().min(1).max(10).optional().default(3).describe('Max sample items to collect per type.'),
        limitItems: z.number().int().min(10).max(5000).optional().describe('Optional cap on total items fetched (pagination batches of 50).')
    }),
    execute: async (args) => {
        const { board_id, includeSamples = true, maxSamplesPerType = 3, limitItems } = args as any;
        const boardId = resolveBoardId(args);

        // 1. Fetch board metadata
        let boardMeta: any = {};
        try {
            const metaResp = await miroClient.get(`/v2/boards/${boardId}`);
            boardMeta = metaResp.data;
        } catch (e) {
            boardMeta = { error: (e as Error).message };
        }

        // 2. Paginate through items
        const allItems: any[] = [];
        let cursor: string | undefined;
        try {
            do {
                if (limitItems && allItems.length >= limitItems) break;
                const params: Record<string,string> = { limit: '50' };
                if (cursor) params.cursor = cursor;
                const resp = await miroClient.get(`/v2/boards/${boardId}/items`, { params });
                const payload = resp.data;
                const batch: any[] = payload?.data || [];
                for (const it of batch) {
                    if (limitItems && allItems.length >= limitItems) break;
                    allItems.push(it);
                }
                cursor = payload?.cursor?.after || undefined;
            } while (cursor && (!limitItems || allItems.length < limitItems));
        } catch (e) {
            return formatApiError(e);
        }

        // 3. Aggregate counts and optional samples
        const counts: Record<string, number> = {};
        const samples: Record<string, { id: string; snippet: string }[]> = {};
        for (const item of allItems) {
            const type = item.type || 'unknown';
            counts[type] = (counts[type] || 0) + 1;
            if (includeSamples) {
                if (!samples[type]) samples[type] = [];
                if (samples[type].length < maxSamplesPerType) {
                    const data = item.data || {};
                    let snippet: string = data.content || data.title || data.description || '';
                    snippet = snippet.replace(/\s+/g, ' ').trim();
                    if (snippet.length > 140) snippet = snippet.slice(0,137) + '…';
                    samples[type].push({ id: item.id, snippet });
                }
            }
        }

        // 4. Build human-readable summary
        const lines: string[] = [];
        lines.push('Board Summary');
        if (boardMeta.name) lines.push(`Name: ${boardMeta.name}`);
        if (boardMeta.description) lines.push(`Description: ${boardMeta.description}`);
        lines.push(`Total items fetched: ${allItems.length}`);
        const countLines = Object.entries(counts).sort((a,b)=> b[1]-a[1]).map(([t,c])=>`- ${t}: ${c}`);
        if (countLines.length) {
            lines.push('Counts by type:');
            lines.push(...countLines);
        }
        if (includeSamples) {
            for (const [type, arr] of Object.entries(samples)) {
                if (!arr.length) continue;
                lines.push(`\n${type} samples:`);
                for (const s of arr) lines.push(`  • (${s.id}) ${s.snippet || '[no text]'}`);
            }
        }

        return formatApiResponse({
            board: { id: boardMeta.id, name: boardMeta.name, description: boardMeta.description },
            totalItems: allItems.length,
            counts,
            samples: includeSamples ? samples : undefined,
            summary: lines.join('\n')
        });
    }
});

// Full item listing with IDs, types, and key text fields.
// This tool transparently paginates through /items and can optionally
// return a compact projection instead of raw Miro objects.
server.addTool({
    name: 'list_board_items',
    description: 'Lists items on a board, paging through /items. Returns IDs, types, and basic text fields; can optionally return raw items.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        parent_item_id: z.string().optional().describe('If provided, only items whose parent is this frame/item are returned.'),
        limitItems: z.number().int().min(1).max(10000).optional().describe('Maximum number of items to retrieve across all pages.'),
        pageSize: z.number().int().min(10).max(50).optional().default(50).describe('Page size for each /items request (10-50).'),
        types: z.array(z.enum(['text', 'shape', 'sticky_note', 'image', 'document', 'card', 'app_card', 'preview', 'frame', 'embed'])).optional().describe('If provided, only items whose type is in this list are returned.'),
        includeRaw: z.boolean().optional().default(false).describe('If true, include raw Miro item objects alongside the compact projection.'),
    }),
    execute: async (args) => {
        const { board_id, parent_item_id, limitItems, pageSize = 50, types, includeRaw = false } = args as any;
        const boardId = resolveBoardId(args);

        const items: any[] = [];
        const compact: { id: string; type: string; title?: string; content?: string; description?: string }[] = [];
        let cursor: string | undefined;

        try {
            do {
                if (limitItems && items.length >= limitItems) break;

                const params: Record<string, string> = { limit: String(pageSize) };
                if (cursor) params.cursor = cursor;
                if (parent_item_id) params.parent_item_id = parent_item_id;
                if (types && types.length === 1) {
                    // Use server-side type filter when a single type is requested
                    params.type = types[0];
                }

                const resp = await miroClient.get(`/v2/boards/${boardId}/items`, { params });
                const payload = resp.data;
                const batch: any[] = payload?.data || [];

                for (const it of batch) {
                    if (limitItems && items.length >= limitItems) break;
                    if (types && types.length > 1 && !types.includes(it.type)) continue;

                    items.push(it);
                    const data = it.data || {};
                    compact.push({
                        id: it.id,
                        type: it.type || 'unknown',
                        title: data.title,
                        content: data.content,
                        description: data.description,
                    });
                }

                cursor = payload?.cursor?.after || undefined;
            } while (cursor && (!limitItems || items.length < limitItems));
        } catch (e) {
            return formatApiError(e);
        }

        return formatApiResponse({
            boardId,
            totalItems: items.length,
            items: includeRaw ? items : undefined,
            compactItems: compact,
            hasMore: Boolean(cursor),
            nextCursor: cursor,
        });
    }
});

// Frame-focused fetch, inspired by miro_fetch.py.
// Fetches all items directly inside a frame (using parent_item_id),
// and optionally fetches one level of nested frames.
server.addTool({
    name: 'fetch_frame_items',
    description: 'Fetches items within a specific frame (and optionally its direct child frames), returning plain-text content similar to the miro_fetch.py helper script.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        frame_id: z.string().min(1).describe('Root frame ID whose contents to fetch.'),
        includeNestedFrames: z.boolean().optional().default(true).describe('If true, also fetch items inside any direct child frames found in the root frame.'),
        limitPerFrame: z.number().int().min(1).max(5000).optional().describe('Optional cap on number of items to fetch per frame (root and each nested).'),
    }),
    execute: async (args) => {
        const { frame_id, includeNestedFrames = true, limitPerFrame } = args as any;
        const boardId = resolveBoardId(args);

        async function fetchItemsForFrame(targetFrameId: string): Promise<any[]> {
            const items: any[] = [];
            let cursor: string | undefined;

            try {
                do {
                    if (limitPerFrame && items.length >= limitPerFrame) break;
                    const params: Record<string, string> = { parent_item_id: targetFrameId, limit: '50' };
                    if (cursor) params.cursor = cursor;

                    const resp = await miroClient.get(`/v2/boards/${boardId}/items`, { params });
                    const payload = resp.data;
                    const batch: any[] = payload?.data || [];

                    for (const it of batch) {
                        if (limitPerFrame && items.length >= limitPerFrame) break;
                        items.push(it);
                    }

                    cursor = payload?.cursor?.after || undefined;
                } while (cursor && (!limitPerFrame || items.length < limitPerFrame));
            } catch (e) {
                throw e;
            }

            return items;
        }

        try {
            // 1) Items directly in the given frame
            const rootItems = await fetchItemsForFrame(frame_id);

            // 2) Build a plain-text friendly projection, and collect nested frames
            const rootProjected = rootItems.map((it) => {
                const data = it.data || {};
                const titleHtml = data.title as string | undefined;
                const contentHtml = data.content as string | undefined;

                const projected: any = {
                    id: it.id,
                    type: it.type,
                    title_html: titleHtml ?? null,
                    content_html: contentHtml ?? null,
                    title: titleHtml ? plainSnippet(titleHtml) : null,
                    content: contentHtml ? plainSnippet(contentHtml) : null,
                };

                if (it.type === 'image') {
                    projected.imageUrl = data.imageUrl ?? null;
                } else if (it.type === 'stamp') {
                    projected.note = 'stamp – no textual content';
                }

                return projected;
            });

            const nestedFrames: { frame_id: string; title: string | null; items: any[] }[] = [];

            if (includeNestedFrames) {
                const childFrames = rootItems.filter((it) => it.type === 'frame');
                for (const frame of childFrames) {
                    const childId = frame.id as string;
                    const data = frame.data || {};
                    const titleHtml = data.title as string | undefined;
                    const titlePlain = titleHtml ? plainSnippet(titleHtml) : null;

                    const nestedItems = await fetchItemsForFrame(childId);
                    const nestedProjected = nestedItems.map((it) => {
                        const d = it.data || {};
                        const tHtml = d.title as string | undefined;
                        const cHtml = d.content as string | undefined;

                        const projected: any = {
                            id: it.id,
                            type: it.type,
                            title_html: tHtml ?? null,
                            content_html: cHtml ?? null,
                            title: tHtml ? plainSnippet(tHtml) : null,
                            content: cHtml ? plainSnippet(cHtml) : null,
                        };

                        if (it.type === 'image') {
                            projected.imageUrl = d.imageUrl ?? null;
                        } else if (it.type === 'stamp') {
                            projected.note = 'stamp – no textual content';
                        }

                        return projected;
                    });

                    nestedFrames.push({
                        frame_id: childId,
                        title: titlePlain,
                        items: nestedProjected,
                    });
                }
            }

            return formatApiResponse({
                boardId,
                frameId: frame_id,
                totalItemsInFrame: rootItems.length,
                items: rootProjected,
                nestedFrames,
            });
        } catch (e) {
            return formatApiError(e);
        }
    },
});

// Convert diagram elements in a frame into Mermaid flowchart code.
// Nodes are shapes / sticky notes / cards inside the frame, edges are
// connectors whose endpoints are both within that frame.
server.addTool({
    name: 'frame_to_mermaid',
    description: 'Fetches diagram items in a frame (shapes, sticky notes, cards + connectors) and returns a Mermaid flowchart definition.',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        frame_id: z.string().min(1).describe('Frame ID to convert into a Mermaid diagram.'),
        direction: z.enum(['LR', 'TB', 'BT', 'RL']).optional().default('LR').describe('Flowchart direction (LR, TB, BT, RL).'),
        limitPerFrame: z.number().int().min(1).max(5000).optional().describe('Optional cap on number of items fetched from the frame.'),
        maxConnectors: z.number().int().min(1).max(5000).optional().describe('Optional cap on number of connectors inspected.'),
    }),
    execute: async (args) => {
        const { frame_id, direction = 'LR', limitPerFrame, maxConnectors } = args as any;
        const boardId = resolveBoardId(args);

        // Fetch all items contained in a frame, including items inside any
        // nested child frames. Because frames themselves are often *not*
        // modeled as children of other frames in the REST API, we:
        //   1) Load the target frame's geometry and compute its bounding box.
        //   2) Find other frames on the board whose bounding boxes are
        //      visually contained within that target frame.
        //   3) Treat the target frame + those contained frames as seeds,
        //      and for each, fetch child items via parent_item_id,
        //      recursively following any child frames.
        async function fetchFrameItems(targetFrameId: string): Promise<any[]> {
            const items: any[] = [];
            const visitedFrames = new Set<string>();

            function computeFrameBBox(frame: any): { left: number; right: number; top: number; bottom: number } | undefined {
                const position = frame.position || {};
                const geometry = frame.geometry || {};

                const x = typeof position.x === 'number' ? position.x : geometry.x;
                const y = typeof position.y === 'number' ? position.y : geometry.y;
                const width = geometry.width;
                const height = geometry.height;

                if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
                    return undefined;
                }

                const halfW = width / 2;
                const halfH = height / 2;
                return {
                    left: x - halfW,
                    right: x + halfW,
                    top: y - halfH,
                    bottom: y + halfH,
                };
            }

            const seedFrameIds = new Set<string>();

            try {
                const rootResp = await miroClient.get(`/v2/boards/${boardId}/items/${targetFrameId}`);
                const rootFrame = rootResp.data;
                const rootBBox = computeFrameBBox(rootFrame);

                seedFrameIds.add(targetFrameId);

                if (rootBBox) {
                    const allFrames: any[] = [];
                    let cursor: string | undefined;

                    do {
                        const params: Record<string, string> = { limit: '50', type: 'frame' };
                        if (cursor) params.cursor = cursor;

                        const resp = await miroClient.get(`/v2/boards/${boardId}/items`, { params });
                        const payload = resp.data;
                        const batch: any[] = payload?.data || [];

                        for (const fr of batch) {
                            if (fr.id === targetFrameId) continue;
                            allFrames.push(fr);
                        }

                        cursor = payload?.cursor?.after || undefined;
                    } while (cursor);

                    for (const fr of allFrames) {
                        const bbox = computeFrameBBox(fr);
                        if (!bbox) continue;

                        if (
                            bbox.left >= rootBBox.left &&
                            bbox.right <= rootBBox.right &&
                            bbox.top >= rootBBox.top &&
                            bbox.bottom <= rootBBox.bottom &&
                            typeof fr.id === 'string'
                        ) {
                            seedFrameIds.add(fr.id as string);
                        }
                    }
                }
            } catch {
                // If we can't load frame metadata, fall back to only the target frame.
                seedFrameIds.add(targetFrameId);
            }

            async function fetchDirectChildren(frameId: string): Promise<string[]> {
                const childFrameIds: string[] = [];
                let cursor: string | undefined;

                do {
                    if (limitPerFrame && items.length >= limitPerFrame) break;

                    const params: Record<string, string> = { parent_item_id: frameId, limit: '50' };
                    if (cursor) params.cursor = cursor;

                    const resp = await miroClient.get(`/v2/boards/${boardId}/items`, { params });
                    const payload = resp.data;
                    const batch: any[] = payload?.data || [];

                    for (const it of batch) {
                        if (limitPerFrame && items.length >= limitPerFrame) break;
                        items.push(it);
                        if (it.type === 'frame' && typeof it.id === 'string') {
                            childFrameIds.push(it.id as string);
                        }
                    }

                    cursor = payload?.cursor?.after || undefined;
                } while (cursor && (!limitPerFrame || items.length < limitPerFrame));

                return childFrameIds;
            }

            const queue: string[] = Array.from(seedFrameIds);

            while (queue.length && (!limitPerFrame || items.length < limitPerFrame)) {
                const frameId = queue.shift() as string;
                if (!frameId || visitedFrames.has(frameId)) continue;
                visitedFrames.add(frameId);

                const newlyFound = await fetchDirectChildren(frameId);
                for (const childId of newlyFound) {
                    if (!visitedFrames.has(childId)) {
                        queue.push(childId);
                    }
                }
            }

            return items;
        }

        async function fetchConnectors(): Promise<any[]> {
            const connectors: any[] = [];
            let cursor: string | undefined;

            do {
                if (maxConnectors && connectors.length >= maxConnectors) break;
                const params: Record<string, string> = { limit: '50' };
                if (cursor) params.cursor = cursor;

                const resp = await miroClient.get(`/v2/boards/${boardId}/connectors`, { params });
                const payload = resp.data;
                const batch: any[] = payload?.data || [];

                for (const c of batch) {
                    if (maxConnectors && connectors.length >= maxConnectors) break;
                    connectors.push(c);
                }

                cursor = payload?.cursor?.after || undefined;
            } while (cursor && (!maxConnectors || connectors.length < maxConnectors));

            return connectors;
        }

        try {
            // Try to resolve the human-readable title of the frame so that the
            // root subgraph label is semantic (e.g. "AIaaS - CurrentState").
            let frameTitle: string | undefined;
            try {
                const frameResp = await miroClient.get(`/v2/boards/${boardId}/items/${frame_id}`);
                const frameItem = frameResp.data || {};
                const data = frameItem.data || {};
                const titleHtml = data.title as string | undefined;
                if (titleHtml) {
                    frameTitle = plainSnippet(titleHtml, 80);
                }
            } catch {
                // If we cannot fetch the frame metadata, we will fall back to
                // a generic frame label based on the ID.
                frameTitle = undefined;
            }

            const frameItems = await fetchFrameItems(frame_id);

            // Treat these item types as diagram nodes.
            const nodeTypes = new Set(['shape', 'sticky_note', 'card']);
            const nodeItems = frameItems.filter((it) => nodeTypes.has(it.type));

            // Map item ID -> node alias + label.
            const nodes: { id: string; alias: string; type: string; label: string }[] = [];
            const idToAlias = new Map<string, string>();
            const idToItem = new Map<string, any>();
            const idToNode = new Map<string, { id: string; alias: string; type: string; label: string }>();

            let counter = 1;
            for (const it of nodeItems) {
                const id = it.id as string;
                const data = it.data || {};
                const labelSource = (data.title as string | undefined) || (data.content as string | undefined) || '';
                let label = plainSnippet(labelSource || id, 80);
                if (!label) label = id;

                const alias = `n${counter++}`;
                idToAlias.set(id, alias);
                idToItem.set(id, it);
                const node = { id, alias, type: it.type, label };
                nodes.push(node);
                idToNode.set(id, node);
            }

            // Fetch connectors and keep only those whose endpoints lie within this frame's nodes.
            const allConnectors = await fetchConnectors();
            const edges: { fromId: string; toId: string; fromAlias: string; toAlias: string; connectorId: string; label?: string }[] = [];
            const existingPairs = new Set<string>();

            for (const c of allConnectors) {
                const startId = c.startItem?.id as string | undefined;
                const endId = c.endItem?.id as string | undefined;
                if (!startId || !endId) continue;

                const fromAlias = idToAlias.get(startId);
                const toAlias = idToAlias.get(endId);
                if (!fromAlias || !toAlias) continue; // skip connectors that link outside this frame

                let label: string | undefined;
                const captions = (c.captions as any[]) || [];
                if (captions.length > 0 && captions[0]?.content) {
                    const raw = captions[0].content as string;
                    const cleaned = plainSnippet(raw, 40);
                    if (cleaned) label = cleaned;
                }

                const edge = {
                    fromId: startId,
                    toId: endId,
                    fromAlias,
                    toAlias,
                    connectorId: c.id as string,
                    ...(label ? { label } : {}),
                };

                edges.push(edge);
                existingPairs.add(`${startId}->${endId}`);
            }

            // Infer container relationships based on geometry (e.g., shapes fully inside
            // a larger "platform" shape). This lets us connect things like
            // "Portal Platform" -> "Portal" / "System API" even when no connectors exist.
            function computeItemBBox(item: any): { left: number; right: number; top: number; bottom: number; width: number; height: number } | undefined {
                const position = item.position || {};
                const geometry = item.geometry || {};

                const x = typeof position.x === 'number' ? position.x : geometry.x;
                const y = typeof position.y === 'number' ? position.y : geometry.y;
                const width = geometry.width;
                const height = geometry.height;

                if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
                    return undefined;
                }

                const halfW = width / 2;
                const halfH = height / 2;
                return {
                    left: x - halfW,
                    right: x + halfW,
                    top: y - halfH,
                    bottom: y + halfH,
                    width,
                    height,
                };
            }

            function getItemColor(item: any): string | undefined {
                if (!item) return undefined;
                const style = item.style || {};
                return style.fillColor || style.cardTheme || style.backgroundColor || undefined;
            }

            const idToBBox = new Map<string, { left: number; right: number; top: number; bottom: number; width: number; height: number }>();
            for (const node of nodes) {
                const item = idToItem.get(node.id);
                if (!item) continue;
                const bbox = computeItemBBox(item);
                if (bbox) {
                    idToBBox.set(node.id, bbox);
                }
            }

            const nodeIds = nodes.map((n) => n.id);

            // Build a containment hierarchy (parent -> children) based on geometry and
            // colour heuristics, but do NOT render these as arrows. We'll represent
            // them as Mermaid subgraphs instead. Each child is assigned to the
            // smallest containing parent.
            const parentOf = new Map<string, string | null>();
            const childrenOf = new Map<string, string[]>();

            // Pre-compute basic size stats and colour distributions so we can
            // identify large "region" colours (for example, pale-yellow platform
            // bands like SaaS / Application Platform).
            const areas: number[] = [];
            const colorStats = new Map<string, { count: number; totalArea: number }>();

            for (const id of nodeIds) {
                const box = idToBBox.get(id);
                if (!box) continue;
                const area = box.width * box.height;
                areas.push(area);

                const item = idToItem.get(id);
                const color = getItemColor(item);
                if (color) {
                    const stat = colorStats.get(color) || { count: 0, totalArea: 0 };
                    stat.count += 1;
                    stat.totalArea += area;
                    colorStats.set(color, stat);
                }
            }

            areas.sort((a, b) => a - b);
            const medianArea = areas.length ? areas[Math.floor(areas.length / 2)] : 0;
            const regionThreshold = medianArea > 0 ? medianArea * 3 : 0;

            const regionColors = new Set<string>();
            const colorEntries = Array.from(colorStats.entries()).sort((a, b) => b[1].totalArea - a[1].totalArea);
            if (colorEntries.length) {
                const topArea = colorEntries[0][1].totalArea;
                for (const [color, stat] of colorEntries) {
                    if (stat.totalArea >= topArea * 0.3) {
                        regionColors.add(color);
                    } else {
                        break;
                    }
                }
            }

            for (const childId of nodeIds) {
                const childBox = idToBBox.get(childId);
                if (!childBox) continue;

                let bestParentId: string | null = null;
                let bestParentArea = Number.POSITIVE_INFINITY;

                for (const parentId of nodeIds) {
                    if (parentId === childId) continue;
                    const parentBox = idToBBox.get(parentId);
                    if (!parentBox) continue;

                    const parentItem = idToItem.get(parentId);
                    const childItem = idToItem.get(childId);
                    const parentColor = getItemColor(parentItem);
                    const childColor = getItemColor(childItem);

                    // Avoid nesting items that visually share the same colour; in our
                    // diagrams, containers tend to have different colours than their
                    // children.
                    if (parentColor && childColor && parentColor === childColor) {
                        continue;
                    }

                    const parentArea = parentBox.width * parentBox.height;
                    const childArea = childBox.width * childBox.height;
                    const parentIsRegionColor = parentColor ? regionColors.has(parentColor) : false;

                    // Require that the parent is meaningfully larger than the child.
                    const minScale = parentIsRegionColor ? 1.02 : 1.05;
                    if (parentBox.width < childBox.width * minScale || parentBox.height < childBox.height * minScale) {
                        continue;
                    }

                    // Compute how much of the child lies inside the parent. This is
                    // more forgiving than strict bounding-box containment so that
                    // slightly overlapping shapes still form a hierarchy.
                    const interLeft = Math.max(parentBox.left, childBox.left);
                    const interRight = Math.min(parentBox.right, childBox.right);
                    const interTop = Math.max(parentBox.top, childBox.top);
                    const interBottom = Math.min(parentBox.bottom, childBox.bottom);
                    const interWidth = interRight - interLeft;
                    const interHeight = interBottom - interTop;
                    if (interWidth <= 0 || interHeight <= 0) continue;

                    const intersectionArea = interWidth * interHeight;
                    const fracInside = intersectionArea / childArea;

                    const requiredFrac = parentIsRegionColor ? 0.6 : 0.8;
                    if (fracInside < requiredFrac) continue;

                    if (parentArea < bestParentArea) {
                        bestParentArea = parentArea;
                        bestParentId = parentId;
                    }
                }

                if (bestParentId) {
                    parentOf.set(childId, bestParentId);
                    const arr = childrenOf.get(bestParentId) || [];
                    arr.push(childId);
                    childrenOf.set(bestParentId, arr);
                } else {
                    parentOf.set(childId, null);
                }
            }

            // Infer dependency relationships for nodes that are visually stacked on
            // top of each other (same parent, overlapping horizontally, close
            // vertically). Direction: top depends on bottom.
            const groupKeyFor = (id: string) => parentOf.get(id) || '__root__';
            const groups = new Map<string, string[]>();

            for (const id of nodeIds) {
                const key = groupKeyFor(id);
                const arr = groups.get(key) || [];
                arr.push(id);
                groups.set(key, arr);
            }

            for (const [groupKey, ids] of groups) {
                if (!ids || ids.length < 2) continue;

                const sorted = ids
                    .map((id) => ({ id, box: idToBBox.get(id) }))
                    .filter((x) => x.box)
                    .sort((a, b) => ((a.box!.top + a.box!.bottom) / 2) - ((b.box!.top + b.box!.bottom) / 2));

                for (let i = 0; i < sorted.length - 1; i++) {
                    const a = sorted[i];
                    const b = sorted[i + 1];
                    const boxA = a.box!;
                    const boxB = b.box!;

                    const horizontalOverlap = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
                    if (horizontalOverlap <= 0) continue;

                    const centerYA = (boxA.top + boxA.bottom) / 2;
                    const centerYB = (boxB.top + boxB.bottom) / 2;
                    const verticalGap = Math.abs(centerYB - centerYA);
                    const minHeight = Math.min(boxA.height, boxB.height);

                    if (verticalGap > minHeight * 0.75) continue;

                    const topId = centerYA <= centerYB ? a.id : b.id;
                    const bottomId = centerYA <= centerYB ? b.id : a.id;
                    const key = `${topId}->${bottomId}`;
                    if (existingPairs.has(key)) continue;

                    const fromAlias = idToAlias.get(topId);
                    const toAlias = idToAlias.get(bottomId);
                    if (!fromAlias || !toAlias) continue;

                    edges.push({
                        fromId: topId,
                        toId: bottomId,
                        fromAlias,
                        toAlias,
                        connectorId: 'inferred-dependency',
                        label: undefined,
                    });
                    existingPairs.add(key);
                }
            }

            // Build Mermaid flowchart.
            const lines: string[] = [];
            lines.push(`flowchart ${direction}`);

            for (const node of nodes) {
                const safeLabel = node.label.replace(/"/g, '"');
                lines.push(`  ${node.alias}["${safeLabel}"]`);
            }

            // Render containment as Mermaid subgraphs instead of arrows.
            function emitSubgraph(parentId: string, indent: string): void {
                const parentNode = idToNode.get(parentId);
                const safeLabel = (parentNode?.label || parentId).replace(/"/g, '\"');
                const parentAlias = parentNode?.alias || parentId;

                const children = childrenOf.get(parentId) || [];
                if (!children.length) return;

                lines.push(`${indent}subgraph sg_${parentAlias}["${safeLabel}"]`);
                for (const childId of children) {
                    if (childrenOf.has(childId)) {
                        emitSubgraph(childId, indent + '  ');
                    } else {
                        const childAlias = idToAlias.get(childId);
                        if (childAlias) {
                            lines.push(`${indent}  ${childAlias}`);
                        }
                    }
                }
                lines.push(`${indent}end`);
            }

            // Region-like shapes (very large compared to others, or painted with the
            // dominant "platform" colours) should always become subgraphs, even if
            // they don't contain any children by geometry. We model them as
            // subgraphs that at least contain the node itself.
            const regionIds = new Set<string>();
            for (const id of nodeIds) {
                const box = idToBBox.get(id);
                if (!box) continue;
                const area = box.width * box.height;
                const item = idToItem.get(id);
                const color = getItemColor(item);
                if (regionThreshold && area >= regionThreshold) {
                    regionIds.add(id);
                } else if (color && regionColors.has(color) && medianArea && area >= medianArea * 0.5) {
                    regionIds.add(id);
                }
            }

            function emitRegionSubgraph(id: string, indent: string): void {
                const node = idToNode.get(id);
                if (!node) return;
                const safeLabel = node.label.replace(/"/g, '"');
                lines.push(`${indent}subgraph sg_${node.alias}["${safeLabel}"]`);
                lines.push(`${indent}  ${node.alias}`);
                lines.push(`${indent}end`);
            }

            // Wrap everything in a single root subgraph for easier conceptual grouping.
            const rootLabel = frameTitle || `Frame ${frame_id}`;
            const safeRootLabel = rootLabel.replace(/"/g, '"');
            lines.push(`  subgraph sg_root["${safeRootLabel}"]`);

            // First emit hierarchical containment subgraphs whose parents have no
            // parent themselves (top-level containers), inside the root.
            for (const parentId of childrenOf.keys()) {
                const p = parentOf.get(parentId);
                if (p) continue; // will be rendered inside its own parent subgraph
                emitSubgraph(parentId, '    ');
            }

            // Then emit region-only subgraphs (like SaaS) that don't already appear
            // as containers in the hierarchy.
            for (const id of regionIds) {
                if (childrenOf.has(id)) continue; // already handled as a container
                emitRegionSubgraph(id, '    ');
            }

            lines.push('  end');

            for (const e of edges) {
                if (e.label) {
                    const safe = e.label.replace(/"/g, '\\"');
                    lines.push(`  ${e.fromAlias} -- "${safe}" --> ${e.toAlias}`);
                } else {
                    lines.push(`  ${e.fromAlias} --> ${e.toAlias}`);
                }
            }

            const mermaid = lines.join('\n');

            return formatApiResponse({
                boardId,
                frameId: frame_id,
                direction,
                mermaid,
                nodes,
                edges,
            });
        } catch (e) {
            return formatApiError(e);
        }
    },
});

// Convert entities and relationships in a frame into a Mermaid ER diagram.
// Nodes are shapes / sticky notes / cards inside the frame, edges are
// connectors whose endpoints are both within that frame. Cardinalities are
// inferred from ERD-style stroke caps on the connector, when present.
server.addTool({
    name: 'frame_to_erd',
    description: 'Fetches entity-like items in a frame and returns a Mermaid erDiagram representation (using ERD stroke caps for cardinalities when available).',
    parameters: z.object({
        board_id: z.string().optional().describe('Override the board ID for this call.'),
        frame_id: z.string().min(1).describe('Frame ID containing the ERD-like diagram.'),
        limitPerFrame: z.number().int().min(1).max(5000).optional().describe('Optional cap on number of items fetched from the frame.'),
        maxConnectors: z.number().int().min(1).max(5000).optional().describe('Optional cap on number of connectors inspected.'),
    }),
    execute: async (args) => {
        const { frame_id, limitPerFrame, maxConnectors } = args as any;
        const boardId = resolveBoardId(args);

        async function fetchItemsForFrame(targetFrameId: string): Promise<any[]> {
            const items: any[] = [];
            let cursor: string | undefined;

            // Compute the bounding box of the target frame based on its
            // position/geometry.
            let frameBBox: { left: number; right: number; top: number; bottom: number } | undefined;
            try {
                const frameResp = await miroClient.get(`/v2/boards/${boardId}/items/${targetFrameId}`);
                const frameItem = frameResp.data;
                const bbox = computeItemBBox(frameItem);
                if (bbox) {
                    frameBBox = { left: bbox.left, right: bbox.right, top: bbox.top, bottom: bbox.bottom };
                }
            } catch {
                frameBBox = undefined;
            }

            if (!frameBBox) {
                return items;
            }

            do {
                if (limitPerFrame && items.length >= limitPerFrame) break;

                const params: Record<string, string> = { limit: '50' };
                if (cursor) params.cursor = cursor;

                const resp = await miroClient.get(`/v2/boards/${boardId}/items`, { params });
                const payload = resp.data;
                const batch: any[] = payload?.data || [];

                for (const it of batch) {
                    if (limitPerFrame && items.length >= limitPerFrame) break;

                    const bbox = computeItemBBox(it);
                    if (!bbox) continue;

                    const centerX = (bbox.left + bbox.right) / 2;
                    const centerY = (bbox.top + bbox.bottom) / 2;

                    if (
                        centerX >= frameBBox.left &&
                        centerX <= frameBBox.right &&
                        centerY >= frameBBox.top &&
                        centerY <= frameBBox.bottom
                    ) {
                        items.push(it);
                    }
                }

                cursor = payload?.cursor?.after || undefined;
            } while (cursor && (!limitPerFrame || items.length < limitPerFrame));

            return items;
        }

        async function fetchConnectors(): Promise<any[]> {
            const connectors: any[] = [];
            let cursor: string | undefined;

            do {
                if (maxConnectors && connectors.length >= maxConnectors) break;
                const params: Record<string, string> = { limit: '50' };
                if (cursor) params.cursor = cursor;

                const resp = await miroClient.get(`/v2/boards/${boardId}/connectors`, { params });
                const payload = resp.data;
                const batch: any[] = payload?.data || [];

                for (const c of batch) {
                    if (maxConnectors && connectors.length >= maxConnectors) break;
                    connectors.push(c);
                }

                cursor = payload?.cursor?.after || undefined;
            } while (cursor && (!maxConnectors || connectors.length < maxConnectors));

            return connectors;
        }

        function makeEntityName(label: string, fallbackIndex: number): string {
            let base = label || `Entity_${fallbackIndex}`;
            base = base.replace(/[^A-Za-z0-9]+/g, '_');
            base = base.replace(/^_+|_+$/g, '');
            if (!base) base = `Entity_${fallbackIndex}`;
            if (/^[0-9]/.test(base)) base = `E_${base}`;
            return base;
        }

        function capToCardinality(cap?: string | null): string {
            if (!cap) return '||';
            switch (cap) {
                case 'erd_one':
                case 'erd_only_one':
                    return '||';
                case 'erd_zero_or_one':
                    return 'o|';
                case 'erd_many':
                case 'erd_one_or_many':
                    return '|{';
                case 'erd_zero_or_many':
                    return 'o{';
                default:
                    return '||';
            }
        }

        function computeItemBBox(item: any): { left: number; right: number; top: number; bottom: number } | undefined {
            if (!item) return undefined;
            const position = item.position || {};
            const geometry = item.geometry || {};

            const x = typeof position.x === 'number' ? position.x : geometry.x;
            const y = typeof position.y === 'number' ? position.y : geometry.y;
            const width = geometry.width;
            const height = geometry.height;

            if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
                return undefined;
            }

            const halfW = width / 2;
            const halfH = height / 2;
            return {
                left: x - halfW,
                right: x + halfW,
                top: y - halfH,
                bottom: y + halfH,
            };
        }

        function extractPkCandidatesFromItem(item: any): string[] {
            const data = item?.data || {};
            const titleHtml = data.title as string | undefined;
            const contentHtml = data.content as string | undefined;
            const merged = `${titleHtml || ''}\n${contentHtml || ''}`.trim();
            const plain = htmlToPlain(merged) || '';
            if (!plain) return [];

            const lines = plain.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const candidates: string[] = [];

            for (const line of lines) {
                if (/\bpk\b/i.test(line) || /\bid\b/i.test(line)) {
                    candidates.push(line);
                }
            }

            if (!candidates.length && lines.length) {
                candidates.push(lines[0]);
            }

            return candidates.slice(0, 3);
        }

        try {
            let frameTitle: string | undefined;
            try {
                const frameResp = await miroClient.get(`/v2/boards/${boardId}/items/${frame_id}`);
                const frameItem = frameResp.data || {};
                const data = frameItem.data || {};
                const titleHtml = data.title as string | undefined;
                if (titleHtml) {
                    frameTitle = plainSnippet(titleHtml, 80);
                }
            } catch {
                frameTitle = undefined;
            }

            const frameItems = await fetchItemsForFrame(frame_id);

            // Map of all items directly inside the frame for quick lookup.
            const idToItem = new Map<string, any>();
            for (const it of frameItems) {
                idToItem.set(String(it.id), it);
            }

            function isSticky(item: any): boolean {
                return item?.type === 'sticky_note';
            }

            const allConnectors = await fetchConnectors();

            // Select connectors that are likely ERD relationships:
            // - both endpoints must be inside this frame
            // - neither endpoint is a sticky note
            const relationshipConnectors: any[] = [];
            for (const c of allConnectors) {
                const startId = c.startItem?.id as string | undefined;
                const endId = c.endItem?.id as string | undefined;
                if (!startId || !endId) continue;

                const startItem = idToItem.get(String(startId));
                const endItem = idToItem.get(String(endId));
                if (!startItem || !endItem) continue;
                if (isSticky(startItem) || isSticky(endItem)) continue;

                relationshipConnectors.push(c);
            }

            // Deduce entities as all nodes touched by these relationship connectors.
            const entityIds = new Set<string>();
            for (const c of relationshipConnectors) {
                const startId = String(c.startItem?.id);
                const endId = String(c.endItem?.id);
                if (startId) entityIds.add(startId);
                if (endId) entityIds.add(endId);
            }

            const entities: { id: string; entityName: string; label: string; pkCandidates: string[] }[] = [];
            const idToEntityName = new Map<string, string>();

            let counter = 1;
            for (const id of entityIds) {
                const it = idToItem.get(id);
                if (!it) continue;
                if (it.type === 'sticky_note') continue;

                const data = it.data || {};
                const labelSource = (data.title as string | undefined) || (data.content as string | undefined) || '';
                let label = plainSnippet(labelSource || id, 80);
                if (!label) label = id;

                const entityName = makeEntityName(label, counter);
                const pkCandidates = extractPkCandidatesFromItem(it);

                idToEntityName.set(id, entityName);
                entities.push({ id, entityName, label, pkCandidates });
                counter += 1;
            }

            const relationships: {
                fromId: string;
                toId: string;
                fromEntity: string;
                toEntity: string;
                leftCardinality: string;
                rightCardinality: string;
                label?: string;
                connectorId: string;
            }[] = [];

            for (const c of relationshipConnectors) {
                const startId = c.startItem?.id as string | undefined;
                const endId = c.endItem?.id as string | undefined;
                if (!startId || !endId) continue;

                const fromEntity = idToEntityName.get(startId);
                const toEntity = idToEntityName.get(endId);
                if (!fromEntity || !toEntity) continue;

                const style = c.style || {};
                const leftCard = capToCardinality(style.startStrokeCap as string | undefined);
                const rightCard = capToCardinality(style.endStrokeCap as string | undefined);

                let relLabel: string | undefined;
                const captions = (c.captions as any[]) || [];
                if (captions.length > 0 && captions[0]?.content) {
                    const raw = captions[0].content as string;
                    const cleaned = plainSnippet(raw, 60);
                    if (cleaned) relLabel = cleaned;
                }

                relationships.push({
                    fromId: startId,
                    toId: endId,
                    fromEntity,
                    toEntity,
                    leftCardinality: leftCard,
                    rightCardinality: rightCard,
                    ...(relLabel ? { label: relLabel } : {}),
                    connectorId: String(c.id),
                });
            }

            const lines: string[] = [];
            lines.push('erDiagram');

            lines.push('  %% Entities discovered inside the frame');
            const seenNames = new Set<string>();
            for (const e of entities) {
                if (seenNames.has(e.entityName)) continue;
                seenNames.add(e.entityName);
                lines.push(`  %% ${e.entityName} = ${e.label}`);
            }

            lines.push('');
            lines.push('  %% Relationships inferred from connectors');
            for (const r of relationships) {
                const mid = `${r.leftCardinality}--${r.rightCardinality}`;
                const suffix = r.label ? ` : ${r.label.replace(/"/g, '\"')}` : '';
                lines.push(`  ${r.fromEntity} ${mid} ${r.toEntity}${suffix}`);
            }

            const erd = lines.join('\n');

            return formatApiResponse({
                boardId,
                frameId: frame_id,
                frameTitle: frameTitle || null,
                erd,
                entities,
                relationships,
            });
        } catch (e) {
            return formatApiError(e);
        }
    },
});


(async () => {
    const token = await resolveMiroToken();

    console.log('Using Miro API token starting with: ' + token.slice(0, 4) + '....' + token.slice(-4));

    if (!activeBoardId) {
        console.warn('MIRO_BOARD_ID not set at startup. You must call set_active_board before using board tools.');
    }

    miroClient = axios.create({
        baseURL: 'https://api.miro.com',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });

    console.log('Starting Miro MCP Server (Explicit)...');
    server.start({
        transportType: 'sse',
        sse: {
            endpoint: '/sse',
            port,
        },
    });
    console.log('Miro MCP Server (Explicit) started successfully on port ' + port + '.');
})();