/*
<MODULE_CONTRACT>
<purpose>Acts as an interface for exporting client-related functionalities, ensuring modularity and reusability within the deployment process.</purpose>
<non-goals>
  <item>Do not define the implementation details of client export logic.</item>
  <item>Do not manage configuration settings or transport mechanisms.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhance Compass scaffolding to better define module roles and interaction boundaries.</item>
</CHANGE_SUMMARY>
*/

export { runClientExport, type ClientExportData } from "./client-export.ts";
// RFC-0180: pure, offline integration-infrastructure resolution (generate half).
export {
  computeSiteInfrastructure,
  renderShardRecord,
  type ComputeInfrastructureInput,
  type DeclaredDestination,
  type SiteInfrastructure,
} from "./infrastructure-generate.ts";
