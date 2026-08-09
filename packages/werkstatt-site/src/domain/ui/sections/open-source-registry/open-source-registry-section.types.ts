/***************************************************************
<MODULE_CONTRACT>
<purpose>Type definitions for the open-source-registry section props.</purpose>
<non-goals>
  <item>Do not define generator logic or SBOM construction.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0489: New type definitions for open-source-registry section.</item>
  <item>RFC-0608: remove deploymentMetadata from data (fetched from build-identity.json at request time via SSR).</item>
</CHANGE_SUMMARY>
***************************************************************/

export interface OpenSourceRegistrySummary {
  componentsTotal: number;
  directDependencies: number;
  transitiveDependencies: number;
  licensesTotal: number;
  componentsWithNotice: number;
  licenseDistribution: Array<{
    license: string;
    count: number;
  }>;
}

export interface OpenSourceRegistryDownload {
  label: string;
  url: string;
  filename: string;
}

export interface OpenSourceRegistryComponent {
  name: string;
  version: string;
  license: string;
  scope: string;
  relationship: string;
  source?: string;
}

export interface OpenSourceRegistrySectionContent {
  background?: unknown;
  effects?: unknown;
  density?: unknown;
  tone?: unknown;
  header?: {
    heading?: string;
    align?: string;
    level?: number;
    hideSectionNumber?: boolean;
  };
  heading?: string;
  dataRef?: string;
  data: {
    summaryHeading: string;
    componentsTotalLabel: string;
    directDependenciesLabel: string;
    transitiveDependenciesLabel: string;
    licensesTotalLabel: string;
    componentsWithNoticeLabel: string;
    licenseDistributionHeading: string;
    deploymentMetadataHeading: string;
    deploymentIdLabel: string;
    buildTimestampLabel: string;
    commitShaLabel: string;
    downloadsHeading: string;
    noticeFileLabel: string;
    licenseFileLabel: string;
    sbomFileLabel: string;
    componentTableHeading: string;
    summary: OpenSourceRegistrySummary;
    downloads: OpenSourceRegistryDownload[];
    components: OpenSourceRegistryComponent[];
  };
}
