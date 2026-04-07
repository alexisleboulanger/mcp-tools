/**
 * Pre-built PromQL queries for Kubernetes namespace-level operational metrics.
 * Each entry returns a query template function that accepts { namespace, interval }.
 */

const NAMESPACE_QUERIES = {
  cpu_usage: {
    title: 'CPU Usage (cores)',
    description: 'Total CPU usage per namespace in cores',
    query: (ns) =>
      `sum(rate(container_cpu_usage_seconds_total{namespace="${ns}",container!="",container!="POD"}[5m]))`,
  },
  cpu_requests: {
    title: 'CPU Requests (cores)',
    description: 'Total CPU requests per namespace',
    query: (ns) =>
      `sum(kube_pod_container_resource_requests{namespace="${ns}",resource="cpu"})`,
  },
  cpu_limits: {
    title: 'CPU Limits (cores)',
    description: 'Total CPU limits per namespace',
    query: (ns) =>
      `sum(kube_pod_container_resource_limits{namespace="${ns}",resource="cpu"})`,
  },
  memory_usage: {
    title: 'Memory Usage (bytes)',
    description: 'Total memory working set per namespace',
    query: (ns) =>
      `sum(container_memory_working_set_bytes{namespace="${ns}",container!="",container!="POD"})`,
  },
  memory_requests: {
    title: 'Memory Requests (bytes)',
    description: 'Total memory requests per namespace',
    query: (ns) =>
      `sum(kube_pod_container_resource_requests{namespace="${ns}",resource="memory"})`,
  },
  memory_limits: {
    title: 'Memory Limits (bytes)',
    description: 'Total memory limits per namespace',
    query: (ns) =>
      `sum(kube_pod_container_resource_limits{namespace="${ns}",resource="memory"})`,
  },
  pod_count: {
    title: 'Running Pods',
    description: 'Number of running pods in the namespace',
    query: (ns) =>
      `count(kube_pod_status_phase{namespace="${ns}",phase="Running"})`,
  },
  pod_restarts: {
    title: 'Pod Restarts (total)',
    description: 'Total container restarts in the namespace',
    query: (ns) =>
      `sum(kube_pod_container_status_restarts_total{namespace="${ns}"})`,
  },
  pod_restart_rate: {
    title: 'Pod Restart Rate (per hour)',
    description: 'Rate of container restarts over the last hour',
    query: (ns) =>
      `sum(increase(kube_pod_container_status_restarts_total{namespace="${ns}"}[1h]))`,
  },
  pods_not_ready: {
    title: 'Pods Not Ready',
    description: 'Pods in non-ready state',
    query: (ns) =>
      `count(kube_pod_status_ready{namespace="${ns}",condition="false"})`,
  },
  network_rx: {
    title: 'Network Receive (bytes/s)',
    description: 'Network receive rate per namespace',
    query: (ns) =>
      `sum(rate(container_network_receive_bytes_total{namespace="${ns}"}[5m]))`,
  },
  network_tx: {
    title: 'Network Transmit (bytes/s)',
    description: 'Network transmit rate per namespace',
    query: (ns) =>
      `sum(rate(container_network_transmit_bytes_total{namespace="${ns}"}[5m]))`,
  },
  pvc_usage: {
    title: 'PVC Usage (bytes)',
    description: 'Persistent volume claim usage per namespace',
    query: (ns) =>
      `sum(kubelet_volume_stats_used_bytes{namespace="${ns}"})`,
  },
  deployment_replicas: {
    title: 'Deployment Replicas (desired vs available)',
    description: 'Desired and available replicas per deployment',
    query: (ns) =>
      `kube_deployment_status_replicas_available{namespace="${ns}"}`,
  },
  hpa_current: {
    title: 'HPA Current Replicas',
    description: 'Current replicas managed by HPA',
    query: (ns) =>
      `kube_horizontalpodautoscaler_status_current_replicas{namespace="${ns}"}`,
  },
};

/** Metrics included in the health overview summary */
const HEALTH_OVERVIEW_METRICS = [
  'cpu_usage',
  'cpu_requests',
  'memory_usage',
  'memory_requests',
  'pod_count',
  'pod_restarts',
  'pod_restart_rate',
  'pods_not_ready',
];

module.exports = { NAMESPACE_QUERIES, HEALTH_OVERVIEW_METRICS };
