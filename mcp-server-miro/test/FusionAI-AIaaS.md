# Mermaid Test

## Expected

:::mermaid
flowchart LR
  n2["Runtime"]
  n3["Design Time"]
  n5["Infrastructure"]
  n8["Fusion AI UI"]
  n9["Pipeline Greenboard"]
  n10["Pipeline Orchestration"]
  n11["Fusion AI Backend"]
  n12["System API"]
  n13["Portal"]
  n14["Identity"]
  n15["Backing Services"]
  n16["Observability"]
  n17["DevOps"]
  n18["Secret Management"]
  n19["Fusion AI Application"]
  n20["External Integration"]
  n21["Agents, Models, APIs, Tools & Data"]
  
  %% AIaaS - CurrentState Global Diagram
  subgraph sg_global["AIaaS - CurrentState"]
    sg_portal
    sg_fusion
    sg_app
    sg_saas
    n5
  end

  %% Portal Platform column
  subgraph sg_portal["Portal Platform"]
    n13
    n12
  end

  %% Fusion AI column (center-right)
  subgraph sg_fusion["Fusion AI"]
    n3
    n2
    n11
    n10
    n21
    n19
    n20

    subgraph sg_ui["Fusion AI UI"]
      n8
      n9
    end
  end

  %% Application Platform row
  subgraph sg_app["Application Platform"]
    n15
    n14
    n18
    n16
    n17
  end

  %% Application Platform row
  subgraph sg_saas["SaaS"]
  end

  %% Layering / dependency arrows (top depends on bottom)
  %% SaaS depends on Portal Platform
  sg_portal --> sg_saas
  %% Portal Platform integrates with Fusion AI
  
  %% Portal Platform built on Application Platform
  sg_portal --> sg_app
  %% Fusion AI built on Application Platform
  sg_portal --> sg_app
  %% Application Platform runs on Infrastructure
  sg_app --> n5

  %% Inside Portal Platform
  %% Portal uses System API
  n13 --> n12

  %% Inside Fusion AI
  %% Design Time drives Fusion AI UI
  n3 --> n8
  %% UI backed by Fusion AI Backend
  n8 --> n11
  %% Runtime hosts Fusion AI Application
  n2 --> n19
  %% Application uses Pipeline Orchestration
  n19 --> n10
  %% Orchestration coordinates Agents/Models/APIs/Data
  n10 --> n21
  %% Backend feeds the orchestration layer
  n11 --> n10
  %% Application integrates with external systems
  n19 --> n20

  %% Backend relies on platform capabilities
  n11 --> n15
  n11 --> n14
  n11 --> n18
  n11 --> n16
  n11 --> n17
:::

## Try

:::mermaid
flowchart LR
  n1["SaaS"]
  n2["Runtime"]
  n3["Design Time"]
  n4["Fusion AI"]
  n5["Infrastructure"]
  n6["Application Platform"]
  n7["Portal Platform"]
  n8["Fusion AI UI"]
  n9["Pipeline Greenboard"]
  n10["Pipeline Orchestration"]
  n11["Fusion AI Backend"]
  n12["System API"]
  n13["Portal"]
  n14["Identity"]
  n15["Backing Services"]
  n16["Observability"]
  n17["DevOps"]
  n18["Secret Management"]
  n19["Fusion AI Application"]
  n20["External Integration"]
  n21["Agents, Models, APIs, Tools & Data"]
  n22["Back end and Integration"]
  subgraph sg_root["Phase 1: AIaaS - Current State"]
    subgraph sg_n6["Application Platform"]
      n3
      n18
    end
    subgraph sg_n8["Fusion AI UI"]
      n9
    end
    subgraph sg_n7["Portal Platform"]
      n12
      n13
    end
    subgraph sg_n4["Fusion AI"]
      n16
      n17
    end
    subgraph sg_n1["SaaS"]
      n1
    end
    subgraph sg_n2["Runtime"]
      n2
    end
    subgraph sg_n3["Design Time"]
      n3
    end
    subgraph sg_n5["Infrastructure"]
      n5
    end
    subgraph sg_n10["Pipeline Orchestration"]
      n10
    end
    subgraph sg_n11["Fusion AI Backend"]
      n11
    end
    subgraph sg_n12["System API"]
      n12
    end
    subgraph sg_n13["Portal"]
      n13
    end
    subgraph sg_n14["Identity"]
      n14
    end
    subgraph sg_n15["Backing Services"]
      n15
    end
    subgraph sg_n16["Observability"]
      n16
    end
    subgraph sg_n17["DevOps"]
      n17
    end
    subgraph sg_n18["Secret Management"]
      n18
    end
    subgraph sg_n19["Fusion AI Application"]
      n19
    end
    subgraph sg_n20["External Integration"]
      n20
    end
    subgraph sg_n21["Agents, Models, APIs, Tools & Data"]
      n21
    end
  end
  n1 --> n7
  n6 --> n14
:::