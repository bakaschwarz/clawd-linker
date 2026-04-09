export interface Package {
  name: string;
  path: string;
  filesPath: string;
  dataJsonPath: string;
}

export interface PackageState {
  schemaVersion: number;
  installedIn: Record<string, string[]>;
  mergedIn?: Record<string, string[]>;
  orderIn?: Record<string, number>;
}

export type ConflictAction = 'overwrite' | 'skip';
export type ConflictCallback = (targetPath: string) => Promise<ConflictAction>;

export interface InstallOptions {
  dryRun?: boolean;
}

export interface ManageOptions {
  dryRun?: boolean;
  yes?: boolean;
}

export interface ReconcileResult {
  pruned: number;
}
