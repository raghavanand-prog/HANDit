// File fingerprints. Web Crypto can't hash a stream, so files are hashed in 1 MiB
// blocks: h_i = SHA-256(block i), and the file's root is
// SHA-256(size as 8 bytes ‖ block size as 4 bytes ‖ h_0 ‖ … ‖ h_n-1), big-endian.
import { concat, toHex } from "./bytes";

export const BLOCK_BYTES = 1024 * 1024;

export class BlockHasher {
  private readonly block = new Uint8Array(BLOCK_BYTES);
  private fill = 0;
  private digests: Uint8Array[] = [];
  size = 0;

  /** Adds bytes in order. Resolves once any completed block has been hashed. */
  async update(bytes: Uint8Array): Promise<void> {
    for (let offset = 0; offset < bytes.length; ) {
      const take = Math.min(BLOCK_BYTES - this.fill, bytes.length - offset);
      this.block.set(bytes.subarray(offset, offset + take), this.fill);
      this.fill += take;
      offset += take;
      this.size += take;
      if (this.fill === BLOCK_BYTES) await this.flush();
    }
  }

  async root(): Promise<string> {
    if (this.fill > 0) await this.flush();
    const header = new DataView(new ArrayBuffer(12));
    header.setBigUint64(0, BigInt(this.size));
    header.setUint32(8, BLOCK_BYTES);
    const root = await crypto.subtle.digest(
      "SHA-256",
      concat(new Uint8Array(header.buffer), ...this.digests),
    );
    return toHex(new Uint8Array(root));
  }

  private async flush() {
    // digest() copies its input, so the block buffer can be reused straight away.
    const digest = await crypto.subtle.digest("SHA-256", this.block.subarray(0, this.fill));
    this.digests.push(new Uint8Array(digest));
    this.fill = 0;
  }
}
