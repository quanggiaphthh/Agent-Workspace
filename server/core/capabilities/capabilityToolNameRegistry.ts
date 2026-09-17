/**
 * CapabilityToolNameRegistry
 * 
 * Provides unique and deterministic mapping between Capability IDs and Tool Names
 * for AI SDKs (Gemini/ADK) which often have strict naming constraints (^[a-zA-Z0-9_]*$).
 */
export class CapabilityToolNameRegistry {
  private static toolToCap = new Map<string, string>();
  private static capToTool = new Map<string, string>();

  /**
   * Generates or retrieves a unique, deterministic tool name for a capability.
   */
  public static getToolName(capabilityId: string): string {
    if (this.capToTool.has(capabilityId)) {
      return this.capToTool.get(capabilityId)!;
    }

    // 1. Sanitize the ID (only alphanumeric and underscores)
    let baseName = capabilityId.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // 2. Ensure it doesn't start with a number
    if (/^[0-9]/.test(baseName)) {
      baseName = 't_' + baseName;
    }

    // 3. Handle potential collisions
    let toolName = baseName;
    let counter = 1;
    while (this.toolToCap.has(toolName) && this.toolToCap.get(toolName) !== capabilityId) {
      toolName = `${baseName}_${counter++}`;
    }

    this.capToTool.set(capabilityId, toolName);
    this.toolToCap.set(toolName, capabilityId);
    
    return toolName;
  }

  /**
   * Resolves a tool name back to its original capability ID.
   */
  public static getCapabilityId(toolName: string): string | undefined {
    return this.toolToCap.get(toolName);
  }

  public static reset() {
    this.toolToCap.clear();
    this.capToTool.clear();
  }
}
