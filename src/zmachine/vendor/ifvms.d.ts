declare module 'ifvms' {
  export class ZVM {
    prepare(story: Uint8Array, options: Record<string, unknown>): void;
  }
  const ifvms: { ZVM: typeof ZVM };
  export default ifvms;
}

declare module 'ifvms/src/zvm/dispatch.js' {
  /** ifvms's Glk dispatch layer (glkapi calls it GiDispa). Needed for autosave. */
  export default class ZVMDispatch {}
}
