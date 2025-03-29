/**
 * Global TypeScript declarations
 */

interface Window {
  // Function to mark state restoration as complete
  markStateRestored: () => void;
  
  // File system utility for accessing uploaded files
  fs?: {
    readFile: (path: string, options?: { encoding?: string }) => Promise<Uint8Array | string>;
  };
}
