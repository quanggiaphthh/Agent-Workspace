/**
 * Server-owned, deterministic and reversible mapping between canonical
 * capability IDs and Gemini/ADK function names.
 *
 * Encoding the UTF-8 bytes as hex is injective (no registration-order
 * collision suffixes) and stays inside ADK's conservative [A-Za-z0-9_]
 * function-name alphabet. We fail closed if an ID cannot fit the 64-char
 * function-name boundary used by Gemini tool declarations.
 */
export class CapabilityToolNameRegistry {
  private static readonly PREFIX = 'cap_';
  private static readonly MAX_TOOL_NAME_LENGTH = 64;
  private static toolToCap = new Map<string, string>();
  private static capToTool = new Map<string, string>();

  public static getToolName(capabilityId: string): string {
    if (typeof capabilityId !== 'string' || capabilityId.length === 0) {
      throw new Error('Unsupported capability ID for ADK tool mapping.');
    }
    const cached = this.capToTool.get(capabilityId);
    if (cached) return cached;

    const encoded = Buffer.from(capabilityId, 'utf8').toString('hex');
    const toolName = `${this.PREFIX}${encoded}`;
    if (toolName.length > this.MAX_TOOL_NAME_LENGTH) {
      throw new Error(`Capability ID "${capabilityId}" cannot be represented within the ADK tool-name length limit.`);
    }

    const existing = this.toolToCap.get(toolName);
    if (existing && existing !== capabilityId) {
      // Hex encoding is injective; this is a defensive invariant, not a suffix fallback.
      throw new Error(`ADK tool-name collision between "${existing}" and "${capabilityId}".`);
    }
    this.capToTool.set(capabilityId, toolName);
    this.toolToCap.set(toolName, capabilityId);
    return toolName;
  }

  public static getCapabilityId(toolName: string): string | undefined {
    const cached = this.toolToCap.get(toolName);
    if (cached) return cached;
    if (typeof toolName !== 'string' || !toolName.startsWith(this.PREFIX)) return undefined;
    const encoded = toolName.slice(this.PREFIX.length);
    if (!encoded || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/.test(encoded)) return undefined;
    try {
      const capabilityId = Buffer.from(encoded, 'hex').toString('utf8');
      if (`${this.PREFIX}${Buffer.from(capabilityId, 'utf8').toString('hex')}` !== toolName) return undefined;
      this.toolToCap.set(toolName, capabilityId);
      this.capToTool.set(capabilityId, toolName);
      return capabilityId;
    } catch {
      return undefined;
    }
  }

  public static reset() {
    this.toolToCap.clear();
    this.capToTool.clear();
  }
}
