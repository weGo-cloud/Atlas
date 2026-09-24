/**
 * The dashboard's KPI card is the shared Atlas StatCard. This alias keeps
 * the dashboard's existing import path (and its `MetricCard` name)
 * stable while there is only one implementation to maintain.
 */
export { StatCard as MetricCard } from "@/components/shared/stat-card";
