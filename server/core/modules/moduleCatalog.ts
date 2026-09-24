export interface ModuleMetadata {
  id: string;
  name: string;
  enabled: boolean;
  canDisable: boolean;
  version: string;
}

class ServerModuleCatalog {
  private modules: Map<string, ModuleMetadata> = new Map();

  public register(metadata: ModuleMetadata) {
    this.modules.set(metadata.id, metadata);
  }

  public listAll(): ModuleMetadata[] {
    return Array.from(this.modules.values());
  }

  public get(id: string): ModuleMetadata | undefined {
    return this.modules.get(id);
  }

  public reset() {
    this.modules.clear();
  }
}

export const serverModuleCatalog = new ServerModuleCatalog();
