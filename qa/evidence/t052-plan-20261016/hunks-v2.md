# T-052 v2 literal hunk packet (verbatim code blocks, extracted mechanically)

Source: qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md sha256 7C5FF94BF6DE46CE53DFD2AEBEC24527CE9080AF9CA4A411F685CE482B5318B3 (on-disk bytes), lines 1521-4737.
Each hunk: id, source line range, section heading, the anchor prose immediately before it, then the literal code.
Later sections marked FINAL/Mandatory/supersedes override earlier hunks with the same anchor (see plan v2 section 6).

## H-001  src 1557-1558  [see heading]  Complete shared type and captured-intrinsic surface

Anchor: Add the existing-file import:

```ts
import { types as nativeTypes } from "node:util";
```

## H-002  src 1563-1609  [see heading]  Complete shared type and captured-intrinsic surface

Anchor: Capture method references at module initialization; these are inert lexical bindings, not exposed registry/capability functions:

```ts
const causalOwn = Object.getOwnPropertyDescriptor;
const causalProto = Object.getPrototypeOf;
const causalKeys = Reflect.ownKeys;
const causalFreeze = Object.freeze;
const causalDefine = Object.defineProperty;
const causalHasOwn = Object.hasOwn;
const causalSame = Object.is;
const causalApply = Reflect.apply;
const causalArray = Array.isArray;
const causalNumber = Number;
const causalInteger = Number.isInteger;
const causalString = String;
const causalPromise = nativeTypes.isPromise;
const causalProxy = nativeTypes.isProxy;
const causalBirthGet = WeakMap.prototype.get;
const causalBirthSet = WeakMap.prototype.set;
const causalFrameHas = WeakSet.prototype.has;
const causalFrameAdd = WeakSet.prototype.add;
const causalSetHas = Set.prototype.has;
const causalSetAdd = Set.prototype.add;

type CausalDescriptor = Readonly<PropertyDescriptor> | undefined;
type CausalTuple = readonly [
  CausalDescriptor, CausalDescriptor, CausalDescriptor,
];
interface CausalRow {
  readonly node: object;
  readonly prototype: object | null;
  readonly descriptors: CausalTuple;
}
export interface WriterCausalFrame extends CausalRow {
  readonly chain: readonly CausalRow[];
  readonly effective: CausalTuple;
  readonly children: readonly unknown[];
  readonly settlements: readonly Promise<unknown>[];
  readonly vector?: Readonly<{
    node: unknown[];
    prototype: object | null;
    keys: readonly PropertyKey[];
    descriptors: readonly (readonly [PropertyKey, CausalDescriptor])[];
  }>;
  readonly unsafe: boolean;
  readonly failed: boolean;
  readonly failure?: unknown;
  readonly unchanged: boolean;
}
```

## H-003  src 1623-1655  [packages/db/src/erasure.ts]  Complete private birth/query implementation

Anchor: Add these fields and static block INSIDE the existing WriterDeadline class:

```ts
static #expiryConstructions =
  new WeakMap<object, readonly WriterCausalFrame[]>();
static #causalFrames = new WeakSet<WriterCausalFrame>();

static {
  const names = ["inspectCausal", "expiryConstruction"] as const;
  for (let index = 0; index < names.length; index++) {
    const key = names[index]!;
    const descriptor = causalOwn(WriterDeadline, key)!;
    causalDefine(WriterDeadline, key, {
      ...descriptor, writable: false, configurable: false,
    });
  }
}

static expiryConstruction(root: unknown): Readonly<{
  nativeShape: readonly WriterCausalFrame[];
  unchanged: boolean;
}> | undefined {
  if ((typeof root !== "object" || root === null) &&
      typeof root !== "function") return undefined;
  const nativeShape = causalApply(
    causalBirthGet, WriterDeadline.#expiryConstructions, [root],
  ) as readonly WriterCausalFrame[] | undefined;
  if (!nativeShape) return undefined;
  const current = WriterDeadline.inspectCausal(root, nativeShape[0]);
  return causalFreeze({
    nativeShape,
    unchanged: current !== undefined && current.unchanged &&
      !current.unsafe && !current.failed,
  });
}
```

## H-004  src 1673-1853  [see heading]  Complete ONE shared ownerless descriptor inspector

Anchor: 

```ts
static inspectCausal(
  root: unknown, previous?: WriterCausalFrame,
): WriterCausalFrame | undefined {
  if ((typeof root !== "object" || root === null) &&
      typeof root !== "function") return undefined;
  const node = root as object;
  const rows: CausalRow[] = [];
  const effective: [
    CausalDescriptor, CausalDescriptor, CausalDescriptor,
  ] = [undefined, undefined, undefined];
  const children: unknown[] = [];
  const settlements: Promise<unknown>[] = [];
  let unsafe = false, failed = false;
  let failure: unknown;
  let vector: WriterCausalFrame["vector"];

  const descriptor = (
    d: PropertyDescriptor | undefined,
  ): CausalDescriptor =>
    d === undefined ? undefined : causalFreeze({ ...d });
  const sameDescriptor = (
    a: CausalDescriptor, b: CausalDescriptor,
  ): boolean => {
    if (a === undefined || b === undefined) return a === b;
    const dataA = causalHasOwn(a, "value");
    const dataB = causalHasOwn(b, "value");
    return dataA === dataB &&
      a.enumerable === b.enumerable &&
      a.configurable === b.configurable &&
      (dataA
        ? a.writable === b.writable && causalSame(a.value, b.value)
        : a.get === b.get && a.set === b.set);
  };

  try {
    const seen = new Set<object>();
    for (let current: object | null = node; current !== null;) {
      if (causalApply(causalSetHas, seen, [current]) ||
          causalProxy(current)) {
        unsafe = true;
        break;
      }
      causalApply(causalSetAdd, seen, [current]);
      const prototype = causalProto(current);
      const own: [
        CausalDescriptor, CausalDescriptor, CausalDescriptor,
      ] = [
        descriptor(causalOwn(current, "cause")),
        descriptor(causalOwn(current, "errors")),
        descriptor(causalOwn(current, "settled")),
      ];
      rows[rows.length] = causalFreeze({
        node: current, prototype, descriptors: causalFreeze(own),
      });
      for (let index = 0; index < 3; index++) {
        if (effective[index] === undefined && own[index] !== undefined) {
          effective[index] = own[index];
        }
      }
      current = prototype;
    }
    for (let index = 0; index < 3; index++) {
      const field = effective[index];
      if (field !== undefined && !causalHasOwn(field, "value")) {
        unsafe = true;
      }
    }
    const cause = effective[0];
    if (cause !== undefined && causalHasOwn(cause, "value")) {
      children[children.length] = cause.value;
    }
    const errors = effective[1];
    if (errors !== undefined && causalHasOwn(errors, "value")) {
      if (causalProxy(errors.value) || !causalArray(errors.value)) {
        unsafe = true;
      } else {
        const array = errors.value as unknown[];
        const prototype = causalProto(array);
        if (prototype !== null && causalProxy(prototype)) unsafe = true;
        const keys = causalKeys(array);
        const entries: (readonly [PropertyKey, CausalDescriptor])[] = [];
        for (let index = 0; index < keys.length; index++) {
          const key = keys[index]!;
          entries[entries.length] = causalFreeze([
            key, descriptor(causalOwn(array, key)),
          ] as const);
        }
        vector = causalFreeze({
          node: array, prototype,
          keys: causalFreeze(keys),
          descriptors: causalFreeze(entries),
        });
        const length = causalOwn(array, "length");
        if (length === undefined || !causalHasOwn(length, "value") ||
            typeof length.value !== "number" ||
            !causalInteger(length.value) || length.value < 0) {
          unsafe = true;
        } else {
          let memberCount = 0;
          for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
            const entry = entries[entryIndex]!;
            const key = entry[0], member = entry[1];
            if (typeof key !== "string") continue;
            const index = causalNumber(key);
            if (!causalInteger(index) || index < 0 ||
                index >= length.value || causalString(index) !== key) continue;
            memberCount++;
            if (member === undefined || !causalHasOwn(member, "value")) {
              unsafe = true;
            } else {
              children[children.length] = member.value;
            }
          }
          if (memberCount !== length.value) unsafe = true;
        }
      }
    }
    const settled = effective[2];
    if (settled !== undefined && causalHasOwn(settled, "value")) {
      if (causalPromise(settled.value)) {
        settlements[settlements.length] = settled.value;
      } else unsafe = true;
    }
  } catch (error) {
    failed = true; unsafe = true; failure = error;
  }

  const first = rows[0];
  const frame: WriterCausalFrame = {
    node, prototype: first?.prototype ?? null,
    descriptors: first?.descriptors ??
      causalFreeze([undefined, undefined, undefined] as const),
    chain: causalFreeze(rows),
    effective: causalFreeze(effective),
    children: causalFreeze(children),
    settlements: causalFreeze(settlements),
    vector, unsafe, failed, failure, unchanged: false,
  };
  let unchanged = previous === undefined && !unsafe && !failed;
  if (previous !== undefined && causalApply(
    causalFrameHas, WriterDeadline.#causalFrames, [previous],
  )) {
    unchanged = !unsafe && !failed &&
      !previous.unsafe && !previous.failed &&
      node === previous.node && rows.length === previous.chain.length;
    if (unchanged) for (let row = 0; row < rows.length; row++) {
      const a = rows[row]!, b = previous.chain[row]!;
      if (a.node !== b.node || a.prototype !== b.prototype) {
        unchanged = false; break;
      }
      for (let index = 0; index < 3; index++) {
        if (!sameDescriptor(a.descriptors[index], b.descriptors[index])) {
          unchanged = false; break;
        }
      }
      if (!unchanged) break;
    }
    if (unchanged) {
      const a = vector, b = previous.vector;
      if (a === undefined || b === undefined) unchanged = a === b;
      else {
        unchanged = a.node === b.node && a.prototype === b.prototype &&
          a.keys.length === b.keys.length &&
          a.descriptors.length === b.descriptors.length;
        if (unchanged) for (let index = 0; index < a.keys.length; index++) {
          if (a.keys[index] !== b.keys[index] ||
              a.descriptors[index]![0] !== b.descriptors[index]![0] ||
              !sameDescriptor(
                a.descriptors[index]![1], b.descriptors[index]![1],
              )) {
            unchanged = false; break;
          }
        }
      }
    }
  }
  const result = causalFreeze({ ...frame, unchanged });
  causalApply(causalFrameAdd, WriterDeadline.#causalFrames, [result]);
  return result;
}
```

## H-005  src 1883-1892  [see heading]  Exact existing constructor/op hunks; run and disposal unchanged

Anchor: Replace ONLY the existing timer body600-601 with:

```ts
this.timer = setTimeout(() => {
  const expired = new FencedWriterDeadlineError();
  const birth = WriterDeadline.inspectCausal(expired)!;
  causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
    expired, causalFreeze([birth]),
  ]);
  this.controller.abort(expired);
  fire(expired);
}, ms);
```

## H-006  src 1896-1904  [see heading]  Exact existing constructor/op hunks; run and disposal unchanged

Anchor: Replace ONLY existing op's one-line throw615 with:

```ts
if (left <= 0 || this.controller.signal.aborted) {
  const expired = new FencedWriterDeadlineError();
  const birth = WriterDeadline.inspectCausal(expired)!;
  causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
    expired, causalFreeze([birth]),
  ]);
  throw expired;
}
```

## H-007  src 1908-1914  [see heading]  Exact existing constructor/op hunks; run and disposal unchanged

Anchor: Preserve EXACT existing:

```ts
run<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, this.expiry]);
}
dispose(): void {
  clearTimeout(this.timer);
}
```

## H-008  src 1929-1933  [see heading]  Exact native first-rejection observer template and job boundary

Anchor: Each consumer captures native method references once in its existing module:

```ts
const observationApply = Reflect.apply;
const observationThen = Promise.prototype.then;
const observationSeenHas = WeakSet.prototype.has;
const observationSeenAdd = WeakSet.prototype.add;
```

## H-009  src 1939-1957  [see heading]  Exact native first-rejection observer template and job boundary

Anchor: Inside each genuine invocation, observedOriginals and observerFailures are local. At FIRST actual native raw registration, BEFORE forwarding onOriginalOperation/ onOwnedWrite or awaiting/racing the SAME actual original P, adapt this template:

```ts
try {
  if (!observationApply(
    observationSeenHas, observedOriginals, [original],
  )) {
    observationApply(observationSeenAdd, observedOriginals, [original]);
    void observationApply(observationThen, original, [
      () => undefined,
      (error: unknown) => {
        try { observeCausal(error); }
        catch (fault) { observerFailures.add(fault); }
        return undefined;
      },
    ]);
  }
} catch (fault) {
  observerFailures.add(fault);
}
// Preserve SAME original registry push/identity, forwarding and await/race.
```

## H-010  src 2019-2026  [packages/engine/src/scribe/graph.ts]  Consumer integration requirements and sound dependency boundary

Anchor: exclusion. For graph compensate, a prospective finite self binding is to change the existing async outer arrow to ordinary same-args arrow returning ONE inner async-IIFE P with its unchanged collector body:

```ts
const compensate = (/* SAME existing args/defaults */) => {
  let settlement!: Promise<void>;
  settlement = (async () => {
    // SAME existing body; exact nested-P !== settlement check.
  })();
  return settlement;
};
```

## H-011  src 2097-2103  [packages/engine/src/scribe/nodes.ts]  CURRENT complete consumer packet — nodes owner transfer

Anchor: This records the final concrete owner packet, not implementation/approval. Shared API is the E509 appendix above; no creator/owner/dependency capability. MODULE INITIALIZED captures adjacent existing imports (import8 adds types as utilTypes):

```ts
const observationApply=Reflect.apply;
const observationThen=Promise.prototype.then;
const observationSeenHas=WeakSet.prototype.has;
const observationSeenAdd=WeakSet.prototype.add;
const observationHasOwn=Object.hasOwn;
const observationIsPromise=utilTypes.isPromise;
```

## H-012  src 2107-2155  [packages/engine/src/scribe/nodes.ts]  CURRENT complete consumer packet — nodes owner transfer

Anchor: Replace1499-1517 LOCAL ledger/adapter:

```ts
type CausalFrame=NonNullable<ReturnType<typeof WriterDeadline.inspectCausal>>;
const expectedFailures=new Map<unknown,{frame:CausalFrame|undefined;children:readonly unknown[]}>();
const observerFailures:unknown[]=[];
const causalFirst=new Map<unknown,CausalFrame>();
const causalHistory=new Map<unknown,Set<CausalFrame>>();
const causalTainted=new Set<unknown>();
const recordedFaults=new Set<unknown>();
const subscriptionSeen=new WeakSet<Promise<unknown>>();
const noteFault=(failure:unknown)=>{
 if(!recordedFaults.has(failure)){recordedFaults.add(failure);observerFailures.push(failure);}
};
const observeCausal=(root:unknown):CausalFrame|undefined=>{
 const queue:unknown[]=[root],seen=new Set<unknown>();let result:CausalFrame|undefined;
 while(queue.length){
  const value=queue.pop();if(seen.has(value))continue;seen.add(value);
  try{
   const previous=causalFirst.get(value);
   const current=WriterDeadline.inspectCausal(value,previous);
   if(Object.is(value,root))result=current;
   const birth=WriterDeadline.expiryConstruction(value);
   if(birth&&!birth.unchanged)causalTainted.add(value);
   if(current){
    if(!previous)causalFirst.set(value,current);
    if(current.unsafe||current.failed||(previous&&!current.unchanged))causalTainted.add(value);
    if(current.failed)noteFault(current.failure);
   }
   for(const frame of [...(birth?.nativeShape??[]),...(current?[current]:[])]){
    const history=causalHistory.get(frame.node)??new Set<CausalFrame>();
    history.add(frame);causalHistory.set(frame.node,history);
    if(frame.unsafe||frame.failed)causalTainted.add(frame.node);
    if(frame.failed)noteFault(frame.failure);
    for(const child of frame.children)queue.push(child);
   }
  }catch(failure){causalTainted.add(value);noteFault(failure);}
 }
 return result;
};
const observePromise=(raw:Promise<unknown>,emit?:(error:unknown)=>void):void=>{
 try{
  if(!observationApply(observationSeenHas,subscriptionSeen,[raw])){
   observationApply(observationSeenAdd,subscriptionSeen,[raw]);
   void observationApply(observationThen,raw,[()=>undefined,(error:unknown)=>{
    try{observeCausal(error);if(emit)emit(error);}catch(failure){noteFault(failure);observeCausal(failure);}
    return undefined;
   }]);
  }
 }catch(failure){noteFault(failure);observeCausal(failure);}
};
```

## H-013  src 2166-2181  [packages/engine/src/scribe/nodes.ts]  CURRENT complete consumer packet — nodes owner transfer

Anchor: only native brand attaches. No API-derived positive membership. Inside onExpectedExpiry1503 FIRST observeCausal(error), before outward callback. Replace1505-1511 receipt body:

```ts
const frame=observeCausal(error);
const birth=WriterDeadline.expiryConstruction(error);
const field=frame?.effective[error instanceof AggregateError?1:0];
const provenanceMatches=!provenance||(error instanceof Error&&field!==undefined&&observationHasOwn(field,'value')&&field.value===provenance.wrappedCause);
if(provenanceMatches&&!expectedFailures.has(error)&&!causalTainted.has(error)&&!frame?.unsafe&&!frame?.failed&&!(birth&&!birth.unchanged)){
 const children:unknown[]=[];
 const ownCause=frame?.descriptors[0];
 if(error instanceof Error&&ownCause&&observationHasOwn(ownCause,'value'))children.push(ownCause.value);
 if(error instanceof AggregateError&&frame?.vector){
  const effectiveCause=frame.effective[0];
  const offset=effectiveCause&&observationHasOwn(effectiveCause,'value')?1:0;
  for(let index=offset;index<frame.children.length;index++)children.push(frame.children[index]);
 }
 expectedFailures.set(error,{frame,children});
}
```

## H-014  src 2214-2229  [packages/engine/src/scribe/nodes.ts]  CURRENT complete consumer packet — nodes owner transfer

Anchor: Attachment census19 fixed:raw5(1528,1531,1539,1560,1594)+work8(1518,1521,1536,1561,1592,1600,1605,1677)+authorize5(1551,1557,1563,1575,1584)+finalsettled1(1717). PLUS1 native-nested template1648, exact-P dedup. No observer child/raw-facade/budget renewal. Discovery1643-1654 replacement:

```ts
const queue=[...roots].reverse(),traversed=new Set<unknown>();
while(queue.length){
 const error=queue.pop();if(traversed.has(error))continue;
 traversed.add(error);discovered.add(error);observeCausal(error);
 if(causalTainted.has(error))forced.add(error);
 for(const frame of causalHistory.get(error)??[]){
  for(const child of frame.children)queue.push(child);
  for(const promise of frame.settlements){
   if(promise===settled||promise===earlyCleanup||drainedNative.has(promise))continue;
   const parents=nested.get(promise)??new Set<unknown>();parents.add(error);nested.set(promise,parents);
   if(nestedFailures.has(promise))forced.add(error);
   observePromise(promise);
  }
 }
}
```

## H-015  src 2241-2250  [packages/engine/src/scribe/nodes.ts]  CURRENT complete consumer packet — nodes owner transfer

Anchor: ancestry. Capture all birth/first/intermediate/current P/Q and removed causal refs. Proof1693-1707 moves INSIDE existing collector for(;;), replacing break1691 after existing stable checks; same fixed point with:

```ts
if(!discovered.has(error)||expected.has(error)||forced.has(error)||causalTainted.has(error))continue;
const birth=WriterDeadline.expiryConstruction(error);
if(birth&&!birth.unchanged)continue;
const current=WriterDeadline.inspectCausal(error,receipt.frame);
if(receipt.frame&&(!current||current.unsafe||current.failed||!current.unchanged))continue;
let childrenExpected=true;
for(const child of receipt.children)if(!expected.has(child)){childrenExpected=false;break;}
if(!childrenExpected)continue;
expected.add(error);grew=true;
```

## H-016  src 2273-2278  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: Existing recordRejectReasons103 only. Shared E509 API; no existing duplicate observeCausal/inspectCausal/history/nativeThen collector. Proposed A-I, not GO. HUNK A: import types as nativeTypes from node:util, module captures:

```ts
const observationApply=Reflect.apply;
const observationThen=Promise.prototype.then;
const observationSeenHas=WeakSet.prototype.has;
const observationSeenAdd=WeakSet.prototype.add;
const observationIsPromise=nativeTypes.isPromise;
```

## H-017  src 2281-2318  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: HUNK B beside117 BEFORE originalExpiry119:

```ts
type Frame=NonNullable<ReturnType<typeof WriterDeadline.inspectCausal>>;
type History={first:Frame;current:Frame;frames:Frame[];children:Set<unknown>;settlements:Set<Promise<unknown>>;tainted:boolean;revision:number};
const causalHistory=new Map<unknown,History>();
const causalDiscoveryRoots=new Set<unknown>();
const causalTaints=new Set<unknown>();
const detachedRoots=new Set<unknown>();
const causalObserverFailures=new Set<unknown>();
const observedOriginals=new WeakSet<object>();
const observeCausal=(root:unknown):void=>{
 const pending:unknown[]=[root];const seen=new Set<unknown>();
 while(pending.length){
  const node=pending.pop();if(seen.has(node))continue;seen.add(node);causalDiscoveryRoots.add(node);
  let history=causalHistory.get(node);
  try{
   const previous=history?.current;
   const frame=WriterDeadline.inspectCausal(node,previous);if(!frame)continue;
   if(!history){history={first:frame,current:frame,frames:[],children:new Set(),settlements:new Set(),tainted:false,revision:0};causalHistory.set(node,history);}
   if(previous&&!frame.unchanged){for(const child of previous.children){if(!frame.children.includes(child))detachedRoots.add(child);}}
   const birth=WriterDeadline.expiryConstruction(node);
   if(!previous||!frame.unchanged)history.frames.push(frame);
   if(birth&&!history.frames.includes(birth.nativeShape[0]!))history.frames.push(birth.nativeShape[0]!);
   const captured=birth?[birth.nativeShape[0]!,frame]:[frame];
   for(const shape of captured){
    if(shape.unsafe||shape.failed||!shape.unchanged||(birth&&!birth.unchanged)){
     causalTaints.add(node);if(!history.tainted){history.tainted=true;history.revision++;}
    }
    if(shape.failed){causalObserverFailures.add(shape.failure);causalDiscoveryRoots.add(shape.failure);}
    for(const child of shape.children){if(!history.children.has(child)){history.children.add(child);history.revision++;}pending.push(child);}
    for(const promise of shape.settlements){if(!history.settlements.has(promise)){history.settlements.add(promise);history.revision++;}}
   }
   history.current=frame;
  }catch(fault){
   causalObserverFailures.add(fault);causalDiscoveryRoots.add(fault);causalTaints.add(node);
   if(history&&!history.tainted){history.tainted=true;history.revision++;}
  }
 }
};
```

## H-018  src 2336-2348  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: Constructor captures immediately after construction before recorder. Existing expiry catch120 already first-observes; no duplicate expiry subscription. HUNK D native N(original):

```ts
try{
 if(observationIsPromise(original)&&!observationApply(observationSeenHas,observedOriginals,[original])){
  observationApply(observationSeenAdd,observedOriginals,[original]);
  void observationApply(observationThen,original,[
   ()=>undefined,
   (error:unknown)=>{
    try{observeCausal(error);}catch(fault){causalObserverFailures.add(fault);causalDiscoveryRoots.add(fault);}
    return undefined;
   },
  ]);
 }
}catch(fault){causalObserverFailures.add(fault);causalDiscoveryRoots.add(fault);}
```

## H-019  src 2363-2368  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: HUNK E seven receipts122/159/177/197/262/343/348: ROOT error/error/error/error/expiryError/aggregate/publicError respectively. After C capture, wrap SAME original source addition/callback/observer catch:

```ts
const construction=WriterDeadline.expiryConstruction(ROOT);
if(!causalTaints.has(ROOT)&&!causalHistory.get(ROOT)?.tainted&&(!construction||construction.unchanged)){
 // SAME original ownExpiryFailures.add only121/158/176/196/261.
 // SAME original onExpectedExpiry callback and observer-error catch.
}
```

## H-020  src 2374-2377  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: Only five producer-positive additions; foreign/wrapper never enter own set. Valid/undefined birth grants nothing. Existing metadata compatibility preserved. HUNK F actual native copied-vector provenance343, within valid receipt guard:

```ts
const wrappedCause=causalHistory.get(aggregate)!.first.descriptors[1]!.value;
try{options.onExpectedExpiry?.(aggregate,{wrappedCause});}
catch(observerError){observeCausal(observerError);if(!expiryObserverFailures.includes(observerError))expiryObserverFailures.push(observerError);}
```

## H-021  src 2383-2396  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: Actual OWN AggregateError.errors copied vector, never constructor-input primary, getter/spread/clone. PublicError348 actual cause provenance unchanged. HUNK G classifier278-292; SAME literal repeated before final337 AFTER nested/undo:

```ts
for(const originalError of [...originalFailures,...detachedRoots]){
 observeCausal(originalError);
 const leaves:unknown[]=[originalError];const visited=new Set<unknown>();let expectedOnly=true;
 while(leaves.length){
  const leaf=leaves.pop();if(visited.has(leaf)){expectedOnly=false;break;}visited.add(leaf);
  const construction=WriterDeadline.expiryConstruction(leaf);const history=causalHistory.get(leaf);
  if(causalTaints.has(leaf)||history?.tainted||(construction&&!construction.unchanged)||!ownExpiryFailures.has(leaf)){
   expectedOnly=false;break;
  }
  if(history)for(const child of history.children)leaves.push(child);
 }
 if(!expectedOnly&&!errors.includes(originalError))errors.push(originalError);
}
```

## H-022  src 2405-2407  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: positives/negative rules, unchanged foreign DAG remains sole original root. HUNK H discovery294-335: errorSeen298 becomes Map<unknown,number>. START existing for(;;)303:

```ts
for(const root of causalDiscoveryRoots){observeCausal(root);errorStack.push(root);}
for(const fault of causalObserverFailures){if(!errors.includes(fault))errors.push(fault);errorStack.push(fault);}
```

## H-023  src 2410-2422  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: Existing observer failures304-308 drain unchanged. Replace310-318:

```ts
const error=errorStack.pop();observeCausal(error);
const history=causalHistory.get(error);const revision=history?.revision??0;
if(errorSeen.get(error)===revision)continue;errorSeen.set(error,revision);
if(history){
 for(const promise of history.settlements){
  if(promise===settled||promise===work||originalOperations.includes(promise)||nestedSeen.has(promise as Promise<void>))continue;
  // EXACT N(original=promise) inline here, no fabricated dependency API.
  nestedSeen.add(promise as Promise<void>);nested.push(promise as Promise<void>);
 }
 const descendants=[...history.children];
 for(let index=descendants.length-1;index>=0;index--)errorStack.push(descendants[index]);
}
```

## H-024  src 2431-2433  [packages/db/src/decisions.ts]  CURRENT complete consumer packet — decisions owner transfer

Anchor: Only exact self and work/originals already drained271-277 with actual outcomes retained excluded. No opaque ancestry/positive transfer; external backedge unproved. HUNK I proposed normal terminal356 AFTER SAME existing priorities352-355:

```ts
if(causalObserverFailures.size===1)throw causalObserverFailures.values().next().value;
if(causalObserverFailures.size>1)throw new AggregateError([...causalObserverFailures],"recordRejectReasons: causal observation failed");
```

## H-025  src 2451-2456  [packages/db/src/erasure.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Existing applyApprovedDiff395/ensureScribeSessionRow1063/recordApprovedSessionSummary1775. Shared E509 inspector; add type WriterCausalFrame to erasure import170-177. Module inert bindings:

```ts
const observationApply=Reflect.apply;
const observationThen=Promise.prototype.then;
const observationSeenHas=WeakSet.prototype.has;
const observationSeenAdd=WeakSet.prototype.add;
const observationHasOwn=Object.hasOwn;
```

## H-026  src 2459-2502  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: PART1 local scopes apply415-417/ensure1080-1084/summary1791-1795, exact adapter:

```ts
const observedOriginals = new WeakSet<object>();
const causalHistory = new Map<unknown, WriterCausalFrame[]>();
const causalLatest = new Map<unknown, WriterCausalFrame>();
const causalChildren = new Map<unknown, Set<unknown>>();
const causalSettlements = new Map<unknown, Set<Promise<unknown>>>();
const causalVeto = new Set<unknown>();
const causalDrift = new Set<unknown>();
const causalFaults = new Set<unknown>();
let causalRevision = 0;
const observeCausal = (root: unknown): void => {
 const queue: unknown[] = [root]; const visited = new Set<unknown>();
 try { while (queue.length) {
  const node = queue.pop(); if (visited.has(node)) continue; visited.add(node);
  const birth = WriterDeadline.expiryConstruction(node);
  const previous = causalLatest.get(node) ?? birth?.nativeShape[0];
  const current = WriterDeadline.inspectCausal(node, previous);
  if (!current) continue;
  let history = causalHistory.get(node);
  if (!history) { history=[]; causalHistory.set(node,history); causalChildren.set(node,new Set()); causalSettlements.set(node,new Set()); causalRevision++; }
  if (birth) for (let i=0;i<birth.nativeShape.length;i++) { const f=birth.nativeShape[i]!; if (!history.includes(f)) history.push(f); }
  // Refined condition: repeated unsafe snapshots alone do NOT prove an observed shape change.
  if ((birth && !birth.unchanged) || (previous && !previous.unsafe && !previous.failed && !current.unchanged)) {
   if (!causalDrift.has(node)) { causalDrift.add(node); causalRevision++; }
  }
  if (current.unsafe || current.failed || causalDrift.has(node)) {
   if (!causalVeto.has(node)) { causalVeto.add(node); causalRevision++; }
  }
  if (!previous || !current.unchanged) history.push(current);
  causalLatest.set(node,current);
  const children=causalChildren.get(node)!; const settlements=causalSettlements.get(node)!;
  const length=history.length;
  for (let i=0;i<length;i++) {
   const f=history[i]!;
   if (f.failed && !causalFaults.has(f.failure)) { causalFaults.add(f.failure); provenanceFailures.push(f.failure); causalRevision++; }
   for (let j=0;j<f.children.length;j++) { const c=f.children[j]; if (!children.has(c)) {children.add(c);causalRevision++;} }
   for (let j=0;j<f.settlements.length;j++) {const p=f.settlements[j]!;if(!settlements.has(p)){settlements.add(p);causalRevision++;}}
  }
  const descendants=[...children]; for(let i=descendants.length-1;i>=0;i--)queue.push(descendants[i]);
 }} catch(fault) {
  if(!causalFaults.has(fault)){causalFaults.add(fault);provenanceFailures.push(fault);causalRevision++;}
  if(!causalVeto.has(root)){causalVeto.add(root);causalRevision++;}
 }
};
```

## H-027  src 2509-2515  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: an infinite fixed point. Spreads traverse own Set metadata, not user errors vector. The FINAL safe-prior drift condition above supersedes the earlier unrefined draft. Native attachment, actual mapped original P before external callback/race/await:

```ts
try {
 if(!observationApply(observationSeenHas,observedOriginals,[original])){
  observationApply(observationSeenAdd,observedOriginals,[original]);
  void observationApply(observationThen,original,[()=>undefined,(error:unknown)=>{observeCausal(error);return undefined;}]);
 }
}catch(fault){observeCausal(fault);provenanceFailures.push(fault);}
```

## H-028  src 2522-2537  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: unexpected. Complete60 sites:55 raw/work PLUS5 discovered native P/Q; explicit scope addition, not old55 mislabel. Dynamic same-P dedup per invocation only. Seven proof negative prelude after existing seen rule:

```ts
observeCausal(leaf);
const frame=causalLatest.get(leaf);
const birth=WriterDeadline.expiryConstruction(leaf);
let intact=!causalVeto.has(leaf)&&(!birth||birth.unchanged);
const history=causalHistory.get(leaf);
if(history)for(let i=0;intact&&i<history.length;i++){
 const checked=WriterDeadline.inspectCausal(leaf,history[i]!);
 if(!checked||checked.unsafe||checked.failed||!checked.unchanged){
  intact=false;
  if(!causalVeto.has(leaf)){causalVeto.add(leaf);causalRevision++;}
  if(!causalDrift.has(leaf)){causalDrift.add(leaf);causalRevision++;}
  if(checked?.failed&&!causalFaults.has(checked.failure)){causalFaults.add(checked.failure);provenanceFailures.push(checked.failure);causalRevision++;}
 }
}
if(!intact){expectedOnly=false;break;}
```

## H-029  src 2541-2545  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Emission proofs substitute provenExpiry/receiptLeaves. Settled apply repeated node =>false; emission/ensure/summary existing repeats=>continue. Existing own-positive:

```ts
if(ownExpiryFailures.has(leaf)){
 if(frame)for(let i=frame.children.length-1;i>=0;i--)leaves.push(frame.children[i]);
 continue;
}
```

## H-030  src 2549-2555  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Apply adds partialFrames Map<PartialApplyError,WriterCausalFrame>. Constructors817/868 capture first before callback. After own branch:

```ts
const first=partialFrames.get(leaf as PartialApplyError), d=frame?.effective[0];
if(partialCauses.has(leaf as PartialApplyError)&&first&&frame&&d&&observationHasOwn(d,'value')&&d.value===partialCauses.get(leaf as PartialApplyError)){
 const checked=WriterDeadline.inspectCausal(leaf,first);
 if(checked&&checked.unchanged&&!checked.unsafe&&!checked.failed){for(let i=frame.children.length-1;i>=0;i--)leaves.push(frame.children[i]);continue;}
}
expectedOnly=false;break;
```

## H-031  src 2559-2568  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Ensure/summary expiryWrappers values become {cause:unknown;frame:WriterCausalFrame; kind:'cause'|'errors'}. Ensure has NO existing setter; invent none. Wrapper proof:

```ts
const receipt=expiryWrappers.get(leaf);
if(receipt&&frame){
 const d=frame.effective[receipt.kind==='cause'?0:1];
 const checked=WriterDeadline.inspectCausal(leaf,receipt.frame);
 if(d&&observationHasOwn(d,'value')&&d.value===receipt.cause&&(receipt.kind!=='errors'||frame.vector?.node===receipt.cause)&&checked&&checked.unchanged&&!checked.unsafe&&!checked.failed){
  for(let i=frame.children.length-1;i>=0;i--)leaves.push(frame.children[i]);continue;
 }
}
expectedOnly=false;break;
```

## H-032  src 2574-2576  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Malformed current receipt grants nothing. Existing exact no-provenance source channel alone may add own positives. No owner transfer from birth query. PART2 five collectors apply445/940,ensure1132/1598,summary1841 add local:

```ts
const drained=new Map<Promise<unknown>,PromiseSettledResult<unknown>>();
const removedRoots=new Set<unknown>();
```

## H-033  src 2579-2587  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Widen nested arrays/Sets to Promise<unknown>. All batches retain SAME P/outcome first:

```ts
const outcomes=await Promise.allSettled(batch);
for(let i=0;i<outcomes.length;i++){
 const outcome=outcomes[i]!;drained.set(batch[i]!,outcome);
 if(outcome.status==='rejected'){
  observeCausal(outcome.reason);
  // SAME existing root category and errorStack routing at this batch site.
 }
}
```

## H-034  src 2593-2619  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Single work batch=[work], same routing. Actual cleanup outcome retained around SAME await; exception remains cleanupRoots/errorStack before exclusion. Discovery apply484-489/982-987,ensure1165-1170/1623-1628,summary1873-1878:

```ts
const error=errorStack.pop(); // E/S: shift (existing queue order).
if(errorSeen.has(error))continue;errorSeen.add(error);
observeCausal(error);
const promises=causalSettlements.get(error);
if(promises)for(const promise of promises){
 if(promise!==settlement&&!drained.has(promise)&&!nestedSeen.has(promise)){
  try{
   if(!observationApply(observationSeenHas,observedOriginals,[promise])){
    observationApply(observationSeenAdd,observedOriginals,[promise]);
    void observationApply(observationThen,promise,[()=>undefined,(error:unknown)=>{observeCausal(error);return undefined;}]);
   }
  }catch(fault){observeCausal(fault);provenanceFailures.push(fault);}
  nestedSeen.add(promise);nested.push(promise);
 }
}
const children=causalChildren.get(error),current=causalLatest.get(error);
if(children){
 const descendants=[...children];
 for(let i=descendants.length-1;i>=0;i--){
  const child=descendants[i];
  if(causalDrift.has(error)&&!current?.children.includes(child)&&!removedRoots.has(child)){
   removedRoots.add(child);nestedRoots.push(child);
  }
  errorStack.push(child); // E/S: unshift (existing order).
 }
}
```

## H-035  src 2625-2628  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: observed drift/removal becomes extra roots, unchanged foreign DAG not flattened. Capture P/Q from all frames independent of prototype/class/native shape. Before discovery per existing fixed-point pass:

```ts
const beforeDiscovery=causalRevision;
errorSeen.clear();
for(const node of causalHistory.keys())errorStack.push(node);
```

## H-036  src 2633-2635  [packages/engine/src/scribe/nodes.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: New nested await =>continue; all waits rescan all nodes. Move originalRoots proof inside final loop after cleanup and stable originals/nested. Recompute unexpected originals every candidate seal. Before seal:

```ts
if(causalRevision!==beforeDiscovery||observed<pending.length||observedObservers<provenanceFailures.length||observedNested<nested.length||observedCleanup<cleanupPending.length)continue;
break;
```

## H-037  src 2651-2660  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: Exact current self or already-drained actual P/outcome only, no graph borrowing. APPLY FINAL UNDO explicit addition: current999 moves into ONCE-ISSUED fixed-point stage; DB algorithm528-576 unchanged except actual first captures:

```ts
let finalUndoIssued=false;
const finalCleanupRoots:unknown[]=[];
// Inside existing collector loop AFTER initial pending/nested stable drains:
if(!finalUndoIssued){
 finalUndoIssued=true;const cleanupOriginal=undo();
 try{await cleanupOriginal;drained.set(cleanupOriginal,{status:'fulfilled',value:undefined});}
 catch(error){drained.set(cleanupOriginal,{status:'rejected',reason:error});observeCausal(error);finalCleanupRoots.push(error);errorStack.push(error);}
 continue;
}
```

## H-038  src 2667-2670  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: nestedRoots,finalCleanupRoots, identity dedup; messages/immutable primary unchanged. Nonexpired paths unchanged. Immediate apply cleanup917/928/934 gets same-invocation sourceCleanupOutcomes Map and preserves same ordering/failure insertion:

```ts
const cleanupOriginal=undo();
try{await cleanupOriginal;sourceCleanupOutcomes.set(cleanupOriginal,{status:'fulfilled',value:undefined});}
catch(error){observeCausal(error);sourceCleanupOutcomes.set(cleanupOriginal,{status:'rejected',reason:error});immediateUndoFailures.push(error);}
```

## H-039  src 2721-2724  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: original category routing. Direct DB cleanup532/542/561/571 before next await, no new raw registration for existing direct-DB-await algorithm. Actual constructors:partial817/868 after SAME ctor/partialCauses.set BEFORE callback:

```ts
observeCausal(partial);
const firstPartial=causalLatest.get(partial);
if(firstPartial)partialFrames.set(partial,firstPartial);
```

## H-040  src 2728-2734  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: 826/877 SAME actual constructor argument wrappedCause:err, no partial.cause getter. Apply native cause504/1003 after same construction:

```ts
observeCausal(cause);
const causeFrame=causalLatest.get(cause);
if(primary.length!==1&&causeFrame&&!causeFrame.unsafe&&!causeFrame.failed&&causeFrame.vector){
 try{options.onExpectedExpiry?.(cause,{wrappedCause:causeFrame.vector.node});}
 catch(observerError){observeCausal(observerError);provenanceFailures.push(observerError);}
}
```

## H-041  src 2740-2755  [packages/db/src/facts.ts]  CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Anchor: PublicFWD508/1007/1675/1687/2144 capture expired immediately after ctor before recorder; SAME actual cause arguments apply:cause/ensure:error/summary:err. Receiver summary1990-1995:

```ts
onExpectedExpiry:(error,provenance)=>{
 observeCausal(error);
 if(provenance){
  const frame=causalLatest.get(error);
  if(frame&&!frame.unsafe&&!frame.failed){
   const cause=frame.effective[0],members=frame.effective[1];
   if(cause&&observationHasOwn(cause,'value')&&cause.value===provenance.wrappedCause){
    expiryWrappers.set(error,{cause:provenance.wrappedCause,frame,kind:'cause'});
   }else if(members&&observationHasOwn(members,'value')&&members.value===provenance.wrappedCause&&frame.vector?.node===provenance.wrappedCause){
    expiryWrappers.set(error,{cause:provenance.wrappedCause,frame,kind:'errors'});
   }
  }
 }else ownExpiryFailures.add(error);
 options.onExpectedExpiry?.(error,provenance);
},
```

## H-042  src 2794-2857  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: default-created fallback initializes missing ledgers. inspectScribe freshLOCAL causal context beside originals2594. NO module-global error/promise history. MODULE type/inert references and private adapters:

```ts
type GraphCausalFrame = NonNullable<ReturnType<typeof WriterDeadline.inspectCausal>>;
interface GraphCausalContext {
  causalHistory?: WeakMap<object, GraphCausalFrame[]>;
  observedOriginals?: WeakSet<Promise<unknown>>;
  observerFailures?: Set<unknown>;
}
const graphApply = Reflect.apply;
const graphThen = Promise.prototype.then;
const graphWeakGet = WeakMap.prototype.get;
const graphWeakSet = WeakMap.prototype.set;
const graphSeenHas = WeakSet.prototype.has;
const graphSeenAdd = WeakSet.prototype.add;
const graphSetHas = Set.prototype.has;
const graphSetAdd = Set.prototype.add;
function rememberGraphCausal(context: GraphCausalContext, root: unknown, pass = new Set<unknown>()): GraphCausalFrame | undefined {
  const queue: unknown[] = [root];
  let first: GraphCausalFrame | undefined;
  for (let next = 0; next < queue.length; next++) {
    const value = queue[next];
    if (graphApply(graphSetHas, pass, [value])) {
      if (next === 0 && value !== null && (typeof value === "object" || typeof value === "function")) {
        const seen = graphApply(graphWeakGet, context.causalHistory!, [value]) as GraphCausalFrame[] | undefined;
        first = seen?.[seen.length - 1];
      }
      continue;
    }
    graphApply(graphSetAdd, pass, [value]);
    if (value === null || (typeof value !== "object" && typeof value !== "function")) continue;
    const born = WriterDeadline.expiryConstruction(value);
    if (born) for (let index = 0; index < born.nativeShape.length; index++) {
      const frame = born.nativeShape[index]!;
      let history = graphApply(graphWeakGet, context.causalHistory!, [frame.node]) as GraphCausalFrame[] | undefined;
      if (!history) { history = []; graphApply(graphWeakSet, context.causalHistory!, [frame.node, history]); }
      let present = false;
      for (let old = 0; old < history.length; old++) if (history[old] === frame) present = true;
      if (!present) history[history.length] = frame;
    }
    let history = graphApply(graphWeakGet, context.causalHistory!, [value]) as GraphCausalFrame[] | undefined;
    const previous = history?.[history.length - 1];
    const frame = WriterDeadline.inspectCausal(value, previous);
    if (!frame) continue;
    if (next === 0) first = frame;
    if (!history) { history = []; graphApply(graphWeakSet, context.causalHistory!, [frame.node, history]); }
    if (!previous || !frame.unchanged) history[history.length] = frame;
    for (let version = 0; version < history.length; version++) {
      const observed = history[version]!;
      for (let child = 0; child < observed.children.length; child++) queue[queue.length] = observed.children[child];
      if (observed.failed) queue[queue.length] = observed.failure;
    }
  }
  return first;
}
function observeGraphOriginal(context: GraphCausalContext, original: Promise<unknown>): void {
  try {
    if (graphApply(graphSeenHas, context.observedOriginals!, [original])) return;
    graphApply(graphSeenAdd, context.observedOriginals!, [original]);
    void graphApply(graphThen, original, [() => undefined, (error: unknown) => {
      try { rememberGraphCausal(context, error); }
      catch (fault) { graphApply(graphSetAdd, context.observerFailures!, [fault]); }
      return undefined;
    }]);
  } catch (fault) { graphApply(graphSetAdd, context.observerFailures!, [fault]); }
}
```

## H-043  src 2868-2875  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: same-turn pre-reaction foreign mutation not reconstructible. THREE receipts778-786(created/created.expectedFailures!),1136-1143(createdCall/ createdCall.expectedFailures!),2031-2038(invocationCreated/invocationCreated.expectedFailures!):

```ts
try {
  const frame = rememberGraphCausal(CONTEXT, error);
  if (!frame || REGISTRY.has(error)) return;
  const wrapped = error instanceof AggregateError ? frame.effective[1] : frame.effective[0];
  const accepted = error instanceof Error && (!provenance || (!!wrapped && Object.hasOwn(wrapped, "value") && Object.is(wrapped.value, provenance.wrappedCause)));
  REGISTRY.set(error, { frame, accepted });
} catch (fault) { graphApply(graphSetAdd, CONTEXT.observerFailures!, [fault]); }
```

## H-044  src 2881-2900  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: First source-construction receipt/accepted flag never relatches. Raw snapshot does not call receipt arrow; history/native birth never enrolls owner/positive/dependency. Proof replaces only causal checks inside SAME existing fixed-point loops/growth:

```ts
if (!receipt.accepted || receipt.frame.unsafe || receipt.frame.failed) continue;
let rejectedShape = false;
const history = CONTEXT.causalHistory!.get(receipt.frame.node) ?? [];
for (let version = 0; version < history.length; version++) {
  const observed = history[version]!;
  if (observed.unsafe || observed.failed) { rejectedShape = true; break; }
  const compared = WriterDeadline.inspectCausal(error, observed);
  if (!compared || !compared.unchanged || compared.unsafe || compared.failed) { rejectedShape = true; break; }
}
if (rejectedShape) continue;
const born = WriterDeadline.expiryConstruction(error);
const current = WriterDeadline.inspectCausal(error, receipt.frame);
if (!current || !current.unchanged || current.unsafe || current.failed || (born && !born.unchanged)) continue;
let acceptedChildren = true;
for (let child = 0; child < current.children.length; child++) {
  if (!graphApply(graphSetHas, EXPECTED_SET, [current.children[child]])) { acceptedChildren = false; break; }
}
if (!acceptedChildren) continue;
EXPECTED_SET.add(error); grew = true;
```

## H-045  src 2914-2945  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Keep original/work/commit/cleanup/nested outcome routing FIRST, then drained ID; rejecting P maps exact reason including undefined (Map.has). Merge observerFailures into roots ANDforced before each queue round. Class/getter traversal becomes:

```ts
const capturePass = new Set<unknown>();
const queue = [...roots];
const discoveryPass = new Set<unknown>();
while (queue.length) {
  const error = queue.pop();
  if (discoveryPass.has(error)) continue;
  discoveryPass.add(error); visited.add(error);
  const current = rememberGraphCausal(CONTEXT, error, capturePass);
  if (!current) continue;
  const history = CONTEXT.causalHistory!.get(current.node)!;
  for (let version = 0; version < history.length; version++) {
    const frame = history[version]!;
    if (frame.unsafe || frame.failed) { roots.add(error); forced.add(error); }
    if (frame.failed) { roots.add(frame.failure); forced.add(frame.failure); queue[queue.length] = frame.failure; }
    for (let child = 0; child < frame.children.length; child++) queue[queue.length] = frame.children[child];
    for (let child = 0; child < frame.settlements.length; child++) {
      const operation = frame.settlements[child]!;
      if (operation === SELF) continue;
      if (drainedIdentities.has(operation)) {
        if (drainedFailures.has(operation)) {
          const reason = drainedFailures.get(operation);
          roots.add(reason); forced.add(reason); forced.add(error);
          // ONLY resume2418 also: settlementFailures.add(reason).
        }
        continue;
      }
      const parents = nested.get(operation) ?? new Set<unknown>();
      parents.add(error); nested.set(operation, parents);
    }
  }
}
```

## H-046  src 2955-2960  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Rejected drained reason+parent negative preserved, not bare completed-P exemption. EXACT local self bindings:compensate861 loses outer async and returns ONE inner async-IIFE actual P, no extra async creator/adoption/await:

```ts
const compensate=(/* SAME args/defaults */)=>{
 let settlement!:Promise<void>;
 settlement=(async()=>{ /* SAME existing collector body with SELF===settlement */ })();
 return settlement;
};
```

## H-047  src 2971-3063  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: 2611/2619/2635/2642/2658/2666/2678/2684/2699/2707/2712/2719,reading2739 before2740 race. OwnDOMException/caller/deadline listeners/abortSource/final2770-2773 unchanged. ONLY catch-settled2745-2769 replacement:

```ts
let settled!: Promise<void>;
settled = (async () => {
  const errors: unknown[] = [];
  const executions: unknown[] = [err];
  const drainedIdentities = new Set<Promise<unknown>>();
  const drainedFailures = new Map<Promise<unknown>, unknown>();
  const reportedDrained = new Set<Promise<unknown>>();
  const metadataFailures = new Set<unknown>();
  if (reading) {
    const finished = await Promise.allSettled([reading]);
    executions.push(...finished.flatMap(value => value.status === "rejected" ? [value.reason] : []));
    const outcome = finished[0]!;
    if (outcome.status === "rejected") drainedFailures.set(reading, outcome.reason);
    drainedIdentities.add(reading);
  }
  let drained = 0;
  const nested = new Set<Promise<unknown>>();
  const joined = new Set<Promise<unknown>>();
  const seen = new Set<unknown>();
  for (;;) {
    while (drained < originals.length) {
      const batch = originals.slice(drained); drained += batch.length;
      const finished = await Promise.allSettled(batch);
      for (let index = 0; index < finished.length; index++) {
        const value = finished[index]!;
        if (value.status === "rejected") {
          errors.push(value.reason); executions.push(value.reason);
          drainedFailures.set(batch[index]!, value.reason);
        }
        drainedIdentities.add(batch[index]!);
      }
    }
    for (const fault of causal.observerFailures!) {
      if (!metadataFailures.has(fault)) {
        metadataFailures.add(fault); errors.push(fault); executions.push(fault);
      }
    }
    const capturePass = new Set<unknown>();
    const discoveryPass = new Set<unknown>();
    const queue = [...executions];
    while (queue.length) {
      const failure = queue.pop();
      if (discoveryPass.has(failure)) continue;
      discoveryPass.add(failure); seen.add(failure);
      const current = rememberGraphCausal(causal, failure, capturePass);
      if (!current) continue;
      const history = causal.causalHistory!.get(current.node)!;
      for (let version = 0; version < history.length; version++) {
        const frame = history[version]!;
        if ((frame.unsafe || frame.failed) && !metadataFailures.has(failure)) {
          metadataFailures.add(failure); errors.push(failure);
        }
        if (frame.failed && !metadataFailures.has(frame.failure)) {
          metadataFailures.add(frame.failure); errors.push(frame.failure); executions.push(frame.failure);
          queue[queue.length] = frame.failure;
        }
        for (let child = 0; child < frame.children.length; child++) queue[queue.length] = frame.children[child];
        for (let child = 0; child < frame.settlements.length; child++) {
          const operation = frame.settlements[child]!;
          if (operation === settled) continue;
          if (drainedIdentities.has(operation)) {
            if (drainedFailures.has(operation) && !reportedDrained.has(operation)) {
              reportedDrained.add(operation);
              const reason = drainedFailures.get(operation);
              errors.push(reason); executions.push(reason); queue[queue.length] = reason;
            }
            continue;
          }
          nested.add(operation);
        }
      }
    }
    const unjoined = [...nested].filter(operation => !joined.has(operation));
    if (unjoined.length) {
      for (const operation of unjoined) joined.add(operation);
      const finished = await Promise.allSettled(unjoined);
      for (let index = 0; index < finished.length; index++) {
        const value = finished[index]!;
        if (value.status === "rejected") {
          errors.push(value.reason); executions.push(value.reason);
          drainedFailures.set(unjoined[index]!, value.reason);
          reportedDrained.add(unjoined[index]!);
        }
        drainedIdentities.add(unjoined[index]!);
      }
      continue;
    }
    if (drained < originals.length) continue;
    break;
  }
  if (errors.length) throw new AggregateError([err, ...errors], "Scribe inspection original settlement failed.");
})();
```

## H-048  src 3070-3077  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: original errors. Report once per actual P, including rejected undefined. FINAL negative shape guard applied at ALL seven discovery and propagation sites, before children/P union; divergent adds originalroot to roots+forced:

```ts
const born = WriterDeadline.expiryConstruction(error);
let divergent = !!born && !born.unchanged;
for (let version = 0; version < history.length; version++) {
  const observed = history[version]!;
  const compared = WriterDeadline.inspectCausal(error, observed);
  if (observed.unsafe || observed.failed || !compared || !compared.unchanged || compared.unsafe || compared.failed) { divergent = true; break; }
}
```

## H-049  src 3083-3095  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Inspect substitutes failure and metadataFailures.add/errors.push if divergent, leaving all original entries. This completes mutated/unreadable negative binding. Propagation975-979 inside SAME while, propagationPass beside queue:

```ts
const error = propagationQueue.pop();
if (propagated.has(error)) continue;
propagated.add(error);
const current = rememberGraphCausal(owner, error, propagationPass);
if (!current) continue;
const history = owner.causalHistory!.get(current.node)!;
for (let version = 0; version < history.length; version++) {
  const frame = history[version]!;
  if (frame.unsafe || frame.failed) { roots.add(error); forced.add(error); }
  if (frame.failed) { roots.add(frame.failure); forced.add(frame.failure); propagationQueue[propagationQueue.length] = frame.failure; }
  for (let child = 0; child < frame.children.length; child++) propagationQueue[propagationQueue.length] = frame.children[child];
}
```

## H-050  src 3101-3115  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Same divergent negative above; no joins/positives here. Live-budget propagation986 same. DisposedFence988-991 retain exact fencedTerminal/deadline/signal/forced/class-rejection/ originalFailures exact-disposition gates; replace only own-cause foreign read:

```ts
let disposedCausal = true;
const causal = rememberGraphCausal(owner, error);
if (causal) {
  const history = owner.causalHistory!.get(causal.node)!;
  for (let version = 0; version < history.length; version++) {
    const frame = history[version]!;
    const compared = WriterDeadline.inspectCausal(error, frame);
    if (frame.unsafe || frame.failed || frame.effective[0] !== undefined || frame.effective[1] !== undefined || frame.effective[2] !== undefined ||
        !compared || !compared.unchanged || compared.unsafe || compared.failed) { disposedCausal = false; break; }
  }
  const born = WriterDeadline.expiryConstruction(error);
  const current = WriterDeadline.inspectCausal(error, causal);
  if (!current || !current.unchanged || current.unsafe || current.failed || (born && !born.unchanged)) disposedCausal = false;
}
```

## H-051  src 3120-3131  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Primitive exact-disposition behavior stays; causal/accessor/inherited ambiguity refuses. Single-member unwrap1419/2497, same Aggregate gate and err throw:

```ts
const frame = WriterDeadline.inspectCausal(failure);
let lengthDescriptor: Readonly<PropertyDescriptor> | undefined;
let firstDescriptor: Readonly<PropertyDescriptor> | undefined;
if (frame?.vector) for (let index = 0; index < frame.vector.descriptors.length; index++) {
  const entry = frame.vector.descriptors[index]!;
  if (entry[0] === "length") lengthDescriptor = entry[1];
  if (entry[0] === "0") firstDescriptor = entry[1];
}
if (failure instanceof AggregateError && frame && !frame.unsafe && !frame.failed &&
    lengthDescriptor && Object.hasOwn(lengthDescriptor,"value") && lengthDescriptor.value === 1 &&
    firstDescriptor && Object.hasOwn(firstDescriptor,"value") && Object.is(firstDescriptor.value,err)) throw err;
```

## H-052  src 3136-3138  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Otherwise same failure. D0512459 DISTINCT positive from forced-aware2441. Keep2477-2480 cleanupFailures0/settlementFailures1/soleProviderAuthorizationRefusedError/positive membership/ALLrootspositive. Equivalent bounded ALL membership if replacing every:

```ts
let allPositive=true;
for(const root of roots)if(!graphApply(graphSetHas,positive,[root])){allPositive=false;break;}
```

## H-053  src 3176-3185  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: WITHOUT wholeP pending push;2739 reading before2740race. Actual cleanup-P7:909/1229/1354/1623/1699/1845/2410 owner/createdCall/createdCall/ created/created/owner/invocationCreated:

```ts
let originalCleanup:Promise<void>|undefined;
try{
 originalCleanup=cleanups[cleanupIndex]!();
 observeGraphOriginal(CONTEXT,originalCleanup);
 await originalCleanup;
}catch(error){
 // SAME original roots/forced/(resume cleanupFailures) additions FIRST.
 if(originalCleanup)drainedFailures.set(originalCleanup,error);
}finally{if(originalCleanup)drainedIdentities.add(originalCleanup);}
```

## H-054  src 3191-3192  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Synchronous throw no P invented; no second call/enrollment. Graph.invoke-P4:1334/2385/2547/2550 contextscreatedCall/resumedCreated/created/created; replace only original ()=>graph.invoke(EXACTARGS):

```ts
()=>{const original=graph.invoke(EXACTARGS);observeGraphOriginal(CONTEXT,original);return original;}
```

## H-055  src 3198-3199  [packages/engine/src/scribe/graph.ts]  CURRENT complete consumer packet — graph owner transfer (6/6 received)

Anchor: Logical/budget4:1320 recordSessionTranscript;1325 recordSessionConcerns;1332 conditional escalateSessionFlags bind SAMEactual callP observecreatedCall then sameawait, no push. 1332 original escalation run callback:

```ts
run:work=>{observeGraphOriginal(createdCall,work);return deadline.run(work);}
```

## H-056  src 3225-3245  [packages/engine/src/scribe/nodes.ts]  FINAL nodes drained-rejection correction (supersedes bare skip above)

Anchor: drainedFailures.set(actualP,reason), THEN drainedNative.add(actualP). Undo catch same actualP/reason before drainedmark; Map.has distinguishes rejectedundefined. Replace only settlement subloop in nodes discovery1643-1654:

```ts
for(const promise of frame.settlements){
 if(promise===settled||promise===earlyCleanup)continue;
 const parents=nested.get(promise)??new Set<unknown>();
 parents.add(error);nested.set(promise,parents);
 if(drainedFailures.has(promise)){
  const reason=drainedFailures.get(promise);
  observeCausal(reason);
  roots.add(reason);forced.add(reason);
  nestedFailures.set(promise,reason);
  for(const parent of parents)forced.add(parent);
  joined.add(promise);
  continue;
 }
 if(nestedFailures.has(promise))forced.add(error);
 if(drainedNative.has(promise)){
  joined.add(promise);
  continue;
 }
 observePromise(promise);
}
```

## H-057  src 3262-3278  [tests (see heading)]  CURRENT complete test packet — fixture owner parts1/2/3a/3b

Anchor: No new title/callback/helper/file. All original statements/16/33/128 remain. Proposed code only; nothing executed. PART1 append existing D016 deadline callback1611 after original1649:

```ts
const native = new WriterDeadline(40); const disposed = new WriterDeadline(40); disposed.dispose();
const heldNative = new Promise<void>(() => undefined); let abortReason: unknown; let abortThrown: unknown; let abortBirth: ReturnType<typeof WriterDeadline.expiryConstruction>; let abortBeforeReaction = false; let reacted = false;
const onAbort = () => { abortReason = native.signal.reason; abortBeforeReaction = !reacted; try { native.signal.throwIfAborted(); } catch (error) { abortThrown = error; } abortBirth = WriterDeadline.expiryConstruction(abortReason); };
native.signal.addEventListener("abort", onAbort, { once: true });
try {
 const firstP = native.run(heldNative); const secondP = native.run(heldNative); assert.notEqual(firstP, secondP);
 const firstSeen = firstP.then(() => assert.fail("held native work cannot win"), error => { reacted = true; return error; }); const secondSeen = secondP.then(() => assert.fail("held native work cannot win"), error => error);
 const [firstError, secondError] = await Promise.all([firstSeen, secondSeen]);
 assert.strictEqual(firstError, abortReason); assert.strictEqual(secondError, abortReason); assert.strictEqual(abortThrown, abortReason); assert.ok(abortBeforeReaction); assert.ok(native.signal.aborted);
 assert.ok(abortBirth?.unchanged); assert.strictEqual(abortBirth.nativeShape[0]!.node, abortReason); assert.ok(Object.isFrozen(abortBirth)); assert.ok(Object.isFrozen(abortBirth.nativeShape));
 assert.equal(disposed.signal.aborted, false); assert.equal(await disposed.run(Promise.resolve("disposed-work")), "disposed-work"); const beforeFailure = new Error("native pre-abort original"); assert.strictEqual(await disposed.run(Promise.reject(beforeFailure)).catch(error => error), beforeFailure); assert.equal(WriterDeadline.expiryConstruction(beforeFailure), undefined);
 let opA: unknown; let opB: unknown; try { native.op(); } catch (error) { opA = error; } try { native.op(); } catch (error) { opB = error; }
 assert.ok(opA instanceof FencedWriterDeadlineError); assert.ok(opB instanceof FencedWriterDeadlineError); assert.notStrictEqual(opA, opB); assert.notStrictEqual(opA, abortReason); assert.ok(WriterDeadline.expiryConstruction(opA)?.unchanged); assert.ok(WriterDeadline.expiryConstruction(opB)?.unchanged); assert.strictEqual(native.signal.reason, abortReason);
 for (const key of ["inspectCausal", "expiryConstruction"] as const) { const descriptor = Object.getOwnPropertyDescriptor(WriterDeadline, key)!; assert.equal(descriptor.writable, false); assert.equal(descriptor.configurable, false); }
 assert.equal(WriterDeadline.inspectCausal(7), undefined); assert.equal(WriterDeadline.expiryConstruction(7), undefined);
} finally { native.signal.removeEventListener("abort", onAbort); native.dispose(); disposed.dispose(); }
```

## H-058  src 3284-3311  [packages/db/src/erasure.ts]  CURRENT complete test packet — fixture owner parts1/2/3a/3b

Anchor: Actual SAME E from two real runs/signal/throwIfAborted; source abort-before-fire is static proof only. disposed40 timer remains clear when other actual40 timer fires. PART2 append existing erasure2202 callback after original2229 cleanup assertion:

```ts
const shapeDeadline = new WriterDeadline(40); const neverShape = new Promise<void>(() => undefined);
try {
 await shapeDeadline.run(neverShape).catch(() => undefined);
 for (const phase of ["sync", "microtask", "after-authenticated-frame"] as const) for (const fault of ["prototype", "cause", "errors", "settled", "getter-cause", "getter-errors", "getter-settled", "sparse", "revoked-vector", "iterator"] as const) {
  let root: unknown; try { shapeDeadline.op(); } catch (error) { root = error; } assert.ok(root instanceof FencedWriterDeadlineError);
  let before = WriterDeadline.inspectCausal(root)!; assert.ok(before && !before.unsafe && !before.failed); assert.ok(Object.isFrozen(before)); assert.ok(Object.isFrozen(before.descriptors)); assert.ok(Object.isFrozen(before.chain)); assert.ok(Object.isFrozen(before.effective)); assert.ok(Object.isFrozen(before.children)); assert.ok(Object.isFrozen(before.settlements)); assert.ok(WriterDeadline.expiryConstruction(root)?.unchanged);
  const P = Object.getOwnPropertyDescriptor(root, "settled")!.value as Promise<unknown>; const Q = Promise.resolve(); const leaf = new Error(`shape-${fault}`); let getterReads = 0; let proxyTraps = 0;
  if (phase === "microtask") await Promise.resolve(); if (phase === "after-authenticated-frame") { before = WriterDeadline.inspectCausal(root, before)!; assert.equal(before.unchanged, true); }
  if (fault === "prototype") { Object.setPrototypeOf(root, AggregateError.prototype); Object.defineProperty(root, "errors", { value: [], writable: true, configurable: true }); }
  else if (fault === "cause") Object.defineProperty(root, "cause", { value: leaf, writable: true, configurable: true });
  else if (fault === "errors") { Object.setPrototypeOf(root, AggregateError.prototype); Object.defineProperty(root, "errors", { value: [leaf], writable: true, configurable: true }); }
  else if (fault === "settled") Object.defineProperty(root, "settled", { value: Q, writable: true, configurable: true });
  else if (fault.startsWith("getter-")) { const field = fault.slice(7); Object.defineProperty(root, field, { configurable: true, get: () => { getterReads++; throw leaf; } }); }
  else if (fault === "sparse") { const vector = new Array<unknown>(4294967295); vector[7] = leaf; Object.setPrototypeOf(root, AggregateError.prototype); Object.defineProperty(root, "errors", { value: vector, writable: true, configurable: true }); }
  else if (fault === "revoked-vector") { const revoked = Proxy.revocable([], { get: () => { proxyTraps++; throw leaf; }, getPrototypeOf: () => { proxyTraps++; throw leaf; }, ownKeys: () => { proxyTraps++; throw leaf; }, getOwnPropertyDescriptor: () => { proxyTraps++; throw leaf; } }); revoked.revoke(); Object.defineProperty(root, "errors", { value: revoked.proxy, writable: true, configurable: true }); }
  else { const vector = [leaf]; Object.defineProperty(vector, Symbol.iterator, { configurable: true, get: () => { getterReads++; throw leaf; } }); Object.defineProperty(root, "errors", { value: vector, writable: true, configurable: true }); }
  const after = WriterDeadline.inspectCausal(root, before)!; assert.equal(after.unchanged, false); assert.equal(WriterDeadline.expiryConstruction(root)?.unchanged, false); assert.equal(getterReads, 0); assert.equal(proxyTraps, 0); assert.strictEqual(before.effective[2]!.value, P); assert.strictEqual(before.settlements[0], P);
  if (fault === "cause" || fault === "errors" || fault === "iterator") assert.ok(after.children.includes(leaf));
  if (fault === "settled") { assert.ok(after.settlements.includes(Q)); assert.notStrictEqual(P, Q); assert.ok(before.settlements.includes(P)); }
  if (fault.startsWith("getter-") || fault === "sparse" || fault === "revoked-vector") { assert.equal(after.unsafe, true); assert.equal(after.failed, false); }
  if (fault === "sparse") { assert.equal(after.children.length, 1); assert.strictEqual(after.children[0], leaf); assert.equal(after.vector!.keys.length, 2); assert.equal(after.vector!.keys[0], "7"); assert.equal(after.vector!.keys[1], "length"); }
  const forged = Proxy.revocable({}, { get: () => { proxyTraps++; throw leaf; }, getPrototypeOf: () => { proxyTraps++; throw leaf; }, ownKeys: () => { proxyTraps++; throw leaf; }, getOwnPropertyDescriptor: () => { proxyTraps++; throw leaf; } }); forged.revoke();
  assert.equal(WriterDeadline.inspectCausal(root, forged.proxy as unknown as WriterCausalFrame)!.unchanged, false); const unsafe = WriterDeadline.inspectCausal(forged.proxy)!; assert.equal(unsafe.unsafe, true); assert.equal(unsafe.failed, false); assert.equal(unsafe.prototype, null); assert.equal(unsafe.chain.length, 0); assert.equal(unsafe.children.length, 0); assert.equal(unsafe.settlements.length, 0); assert.equal(proxyTraps, 0); assert.equal(WriterDeadline.expiryConstruction(forged.proxy), undefined);
 }
 let decorated: unknown; try { shapeDeadline.op(); } catch (error) { decorated = error; } assert.ok(decorated instanceof FencedWriterDeadlineError); const decoratedBefore = WriterDeadline.inspectCausal(decorated)!; Object.defineProperty(decorated, "pregelTaskId", { value: "real-framework-compatible-extra", configurable: true }); Object.defineProperty(decorated, "name", { value: "decorated", configurable: true }); Object.defineProperty(decorated, "stack", { value: "decorated", configurable: true }); assert.equal(WriterDeadline.inspectCausal(decorated, decoratedBefore)!.unchanged, true); assert.equal(WriterDeadline.expiryConstruction(decorated)?.unchanged, true);
 // Part5a every-poison block inserts here before finally.
} finally { shapeDeadline.dispose(); }
```

## H-059  src 3318-3370  [tests (see heading)]  CURRENT complete test packet — fixture owner parts1/2/3a/3b

Anchor: next block does. Huge synchronous loop cannot be preempted by Node callback timeout. PART3a/3b append ONLY normalcheckpointer122 tail AFTER original435-437, before438 closure;16 non-normal early-return139-433 untouched:

```ts
const causalCases: ReadonlyArray<readonly ["sync"|"microtask"|"post-receipt", "clean"|"pregel"|"prototype"|"cause"|"errors"|"settled"|"getters"|"sparse"|"revoked-vector"|"revoked-raw"]> = [["sync","clean"],["sync","pregel"],["sync","getters"],["sync","sparse"],["sync","revoked-vector"],["sync","revoked-raw"],["sync","prototype"],["microtask","prototype"],["post-receipt","prototype"],["sync","cause"],["microtask","cause"],["post-receipt","cause"],["sync","errors"],["microtask","errors"],["post-receipt","errors"],["sync","settled"],["microtask","settled"],["post-receipt","settled"]];
for (const [phase, fault] of causalCases) {
 const threadId = `causal-${phase}-${fault}`; const input = baseInput({sessionId:`session-${threadId}`}); const graph = compileScribeGraph(deps,{checkpointer:createScribeCheckpointer(tenantScopedClient(fake.client,"scribe-test"))});
 const beforeRows = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()])); const beforeBytes = BSON.serialize(beforeRows,{ignoreUndefined:false});
 const rows = fakeDb.collection<any>(COLLECTION_NAMES.scribe_checkpoints); const originalFind = rows.findOne.bind(rows); const originalInvoke = graph.invoke.bind(graph); const originalRunDescriptor = Object.getOwnPropertyDescriptor(WriterDeadline.prototype,"run")!; const originalRun = originalRunDescriptor.value as WriterDeadline["run"];
 let openRaw!:()=>void; let enterRaw!:()=>void; const rawHeld = new Promise<void>(resolve=>{openRaw=resolve;}); const rawReady = new Promise<void>(resolve=>{enterRaw=resolve;}); let raw:Promise<unknown>|undefined; let rawObserved:Promise<{value:unknown}|{error:unknown}>|undefined; let once=true;
 let signal:AbortSignal|undefined; let reason:unknown; let thrownReason:unknown; let birth:ReturnType<typeof WriterDeadline.expiryConstruction>; let abortBeforeReaction=false; let reactionSeen=false; let mutationDone=false; let mutationError:unknown; let getterReads=0; let proxyTraps=0; let rawFault:unknown;
 const leaf = new Error(`PRIVATE_CAUSAL_${phase}_${fault}`); let rejectQ!:(error:unknown)=>void; const Q=new Promise<void>((_resolve,reject)=>{rejectQ=reject;}); void Q.catch(()=>undefined); let QUsed=false;
 const observed:unknown[]=[]; const runs:Array<{deadline:WriterDeadline;returned:Promise<unknown>}> = []; let postQueued=false;
 const mutate = ()=>{try {
  if (fault==="prototype") {Object.setPrototypeOf(reason,AggregateError.prototype);Object.defineProperty(reason,"errors",{value:[],writable:true,configurable:true});Object.defineProperty(reason,"settled",{value:Q,writable:true,configurable:true});QUsed=true;}
  else if (fault==="cause") Object.defineProperty(reason,"cause",{value:leaf,writable:true,configurable:true});
  else if (fault==="errors") {Object.setPrototypeOf(reason,AggregateError.prototype);Object.defineProperty(reason,"errors",{value:[leaf],writable:true,configurable:true});}
  else if (fault==="settled") {Object.defineProperty(reason,"settled",{value:Q,writable:true,configurable:true});QUsed=true;}
  else if (fault==="pregel") Object.defineProperty(reason,"pregelTaskId",{value:"compatible-extra",writable:true,configurable:true});
  else if (fault==="getters") for (const field of ["cause","errors","settled"]) Object.defineProperty(reason,field,{configurable:true,get:()=>{getterReads++;throw leaf;}});
  else if (fault==="sparse") {const vector=new Array<unknown>(4294967295);vector[7]=leaf;Object.setPrototypeOf(reason,AggregateError.prototype);Object.defineProperty(reason,"errors",{value:vector,writable:true,configurable:true});}
  else if (fault==="revoked-vector" || fault==="revoked-raw") {const revoked=Proxy.revocable(fault==="revoked-vector"?[]:{},{get:()=>{proxyTraps++;throw leaf;},getPrototypeOf:()=>{proxyTraps++;throw leaf;},ownKeys:()=>{proxyTraps++;throw leaf;},getOwnPropertyDescriptor:()=>{proxyTraps++;throw leaf;}});revoked.revoke();if(fault==="revoked-vector")Object.defineProperty(reason,"errors",{value:revoked.proxy,writable:true,configurable:true});else rawFault=revoked.proxy;}
  mutationDone=true;
 } catch(error){mutationError=error;}};
 const onAbort=()=>{try {reason=signal!.reason;abortBeforeReaction=!reactionSeen;try{signal!.throwIfAborted();}catch(error){thrownReason=error;}birth=WriterDeadline.expiryConstruction(reason);if(phase==="sync")mutate();else if(phase==="microtask")queueMicrotask(mutate);}catch(error){mutationError=error;}};
 let attempt:Promise<{value:unknown}|{error:unknown}>|undefined; let exposed:FencedWriterDeadlineError|undefined; let closure:Promise<{value:unknown}|{error:unknown}>|undefined; let closureDone=false;
 try {
  Object.defineProperty(WriterDeadline.prototype,"run",{...originalRunDescriptor,value:function<T>(this:WriterDeadline,work:Promise<T>):Promise<T>{const returned=originalRun.call(this,work) as Promise<T>;const row={deadline:this,returned};runs.push(row);for(let observer=0;observer<2;observer++)void Promise.prototype.then.call(returned,()=>undefined,(error:unknown)=>{try{if(this.signal===signal&&error===signal!.reason){reactionSeen=true;observed.push(error);if(phase==="post-receipt"&&!postQueued&&runs.find(item=>item.deadline.signal===signal)===row){postQueued=true;queueMicrotask(mutate);}}}catch(failure){mutationError=failure;}});return returned;}});
  graph.invoke=((...args:Parameters<typeof originalInvoke>)=>{signal=args[1]?.signal;assert.ok(signal instanceof AbortSignal);signal.addEventListener("abort",onAbort,{once:true});return originalInvoke(...args);}) as typeof graph.invoke;
  rows.findOne=((...args:Parameters<typeof originalFind>)=>{const filter=args[0] as Record<string,unknown>;if(!once||filter.tenantId!=="scribe-test"||filter.thread_id!==threadId||typeof filter.checkpoint_id!=="string"||typeof filter.checkpoint_ns!=="string")return originalFind(...args);once=false;const operation=(async()=>{const actual=await originalFind(...args);assert.equal(actual,null);enterRaw();await rawHeld;if(rawFault!==undefined)throw rawFault;return actual;})();raw=operation;rawObserved=operation.then(value=>({value}),error=>({error}));return operation;}) as typeof rows.findOne;
  attempt=startScribe(graph,input,{threadId,writerDeadlineMs:200}).then(value=>({value}),error=>({error}));
  const reached=await Promise.race([rawReady.then(()=>({reached:true})),attempt]);assert.ok("reached"in reached&&raw&&rawObserved);const providerAtHold=deps.provider.calls.length;
  const terminal=await attempt;assert.ok("error"in terminal&&terminal.error instanceof FencedWriterDeadlineError);if(!("error"in terminal)||!(terminal.error instanceof FencedWriterDeadlineError))throw new Error("causal probe failed typed original deadline");exposed=terminal.error;
  assert.equal(mutationError,undefined);assert.ok(mutationDone);assert.strictEqual(reason,thrownReason);assert.ok(abortBeforeReaction);assert.ok(observed.length>=2);for(const observedError of observed)assert.strictEqual(observedError,reason);assert.ok(birth?.unchanged,"captured birth was clean BEFORE caller mutation");
  const changed = !["clean","pregel","revoked-raw"].includes(fault); assert.equal(WriterDeadline.expiryConstruction(reason)?.unchanged,!changed);
  const primaryCause=Object.getOwnPropertyDescriptor(exposed,"cause");closure=exposed.settled.then(value=>{closureDone=true;return{value};},error=>{closureDone=true;return{error};}); await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(closureDone,false,"source closure waits actual held raw driver");openRaw();const rawResult=await rawObserved;
  if(fault==="revoked-raw"){assert.ok("error"in rawResult);if("error"in rawResult)assert.strictEqual(rawResult.error,rawFault);}else assert.deepEqual(rawResult,{value:null});
  if(QUsed){await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(closureDone,false,"after raw closure, actual substituted Q remains required");rejectQ(leaf);}else rejectQ(leaf);
  const outcome=await closure;
  if(fault==="clean"||fault==="pregel")assert.deepEqual(outcome,{value:undefined});
  else {
   assert.ok("error"in outcome&&outcome.error instanceof AggregateError);if(!("error"in outcome)||!(outcome.error instanceof AggregateError))throw new Error("shape drift became successful settlement");assert.equal(outcome.error.message,"Scribe original settlement and owned compensation failed.");
   const todo:unknown[]=[outcome.error];const seen=new Set<unknown>();
   for(let index=0;index<todo.length;index++){const value=todo[index];if(seen.has(value))continue;seen.add(value);if(value===null||(typeof value!=="object"&&typeof value!=="function")||nativeTypes.isProxy(value))continue;
    for(const field of ["cause","errors","settled"]){const descriptor=Object.getOwnPropertyDescriptor(value,field);if(descriptor&&Object.hasOwn(descriptor,"value"))todo.push(descriptor.value);}
    if(Array.isArray(value))for(const key of Reflect.ownKeys(value)){if(typeof key!=="string"||! /^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=4294967295)continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor&&Object.hasOwn(descriptor,"value"))todo.push(descriptor.value);}
   }
   assert.ok(seen.has(fault==="revoked-raw"?rawFault:reason),"exact actual unexpected ROOT retained");if(QUsed||fault==="cause"||fault==="errors"||fault==="sparse")assert.ok(seen.has(leaf));
  }
  assert.strictEqual(Object.getOwnPropertyDescriptor(exposed,"cause")?.value,primaryCause?.value);assert.equal(getterReads,0);assert.equal(proxyTraps,0);assert.equal(deps.provider.calls.length,providerAtHold);
  const afterRows=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()]));assert.deepEqual(afterRows,beforeRows);assert.deepEqual(BSON.serialize(afterRows,{ignoreUndefined:false}),beforeBytes);
 } finally {
  openRaw();rejectQ(leaf);rows.findOne=originalFind;graph.invoke=originalInvoke;if(signal)signal.removeEventListener("abort",onAbort);Object.defineProperty(WriterDeadline.prototype,"run",originalRunDescriptor);
  const terminal=attempt?await attempt:undefined;await Promise.allSettled([...(raw?[raw]:[]),Q,...(exposed?[exposed.settled]:[]),...(terminal&&"error"in terminal&&terminal.error instanceof FencedWriterDeadlineError?[terminal.error.settled]:[])]);
 }
}
```

## H-060  src 3386-3413  [tests (see heading)]  CURRENT complete test packet — Part4 retained original proposal and FINAL correction

Anchor: Its finally/P-binding is superseded by the mandatory finite correction immediately after the block. The authoritative current test is this body PLUS those exact three substitutions; do not implement the historical incomplete finally.

```ts
for (const kind of ["native","wrapper-PQ"] as const) {
 const donorThread=`causal-donor-${kind}`;const targetThread=`causal-receiver-${kind}`;const audits=fakeDb.collection<any>(COLLECTION_NAMES.decisions);const savedInsert=audits.insertOne.bind(audits);let openA!:()=>void;let hitA!:()=>void;const Aheld=new Promise<void>(resolve=>{openA=resolve;});const Aready=new Promise<void>(resolve=>{hitA=resolve;});let A:Promise<unknown>|undefined;let donorAttempt:Promise<unknown>|undefined;let donorWrapper:FencedWriterDeadlineError|undefined;
 const checkpoints=fakeDb.collection<any>(COLLECTION_NAMES.scribe_checkpoints);const savedFind=checkpoints.findOne.bind(checkpoints);let openR!:()=>void;let hitR!:()=>void;const Rheld=new Promise<void>(resolve=>{openR=resolve;});const Rready=new Promise<void>(resolve=>{hitR=resolve;});let R:Promise<unknown>|undefined;let receiverAttempt:Promise<{value:unknown}|{error:unknown}>|undefined;let receiverError:FencedWriterDeadlineError|undefined;let closeReceiver:Promise<{value:unknown}|{error:unknown}>|undefined;let receiverDone=false;let once=true;let donorOnce=true;let receiverSignal:AbortSignal|undefined;
 const S=new Error(`PRIVATE_CAUSAL_Q_${kind}`);let failQ!:(error:unknown)=>void;const Q=new Promise<void>((_resolve,reject)=>{failQ=reject;});void Q.catch(()=>undefined);const receiver=new WriterDeadline(200);const graph=compileScribeGraph(deps,{checkpointer:createScribeCheckpointer(tenantScopedClient(fake.client,"scribe-test"))});const savedInvoke=graph.invoke.bind(graph);
 try {
  audits.insertOne=((...args:Parameters<typeof savedInsert>)=>{if(!donorOnce||args[0].kind!=="per_fact_reject"||args[0].threadId!==donorThread)return savedInsert(...args);donorOnce=false;assert.equal(args[0].tenantId,"scribe-test");assert.equal(typeof args[0].writerToken,"string");const operation=(async()=>{const actual=await savedInsert(...args);hitA();await Aheld;return actual;})();A=operation;void operation.catch(()=>undefined);return operation;}) as typeof audits.insertOne;
  donorAttempt=recordRejectReasons(db,{threadId:donorThread,studentId:baseInput().studentId,rejected:[{key:"actual-donor-probe"}]},{deadlineMs:20}).then(()=>assert.fail("held real audit must reach its actual deadline"),error=>error);
  await Promise.race([Aready,donorAttempt]);assert.ok(A);const donorResult=await donorAttempt;assert.ok(donorResult instanceof FencedWriterDeadlineError);donorWrapper=donorResult;
  const P=Object.getOwnPropertyDescriptor(donorWrapper,"settled")!.value as Promise<unknown>;assert.ok(nativeTypes.isPromise(P));let Pdone=false;void Promise.prototype.then.call(P,()=>{Pdone=true;},()=>{Pdone=true;});await Promise.resolve();assert.equal(Pdone,false,"P is a genuine helper closure waiting real A");
  const nativeForeign=Object.getOwnPropertyDescriptor(donorWrapper,"cause")!.value;assert.equal(WriterDeadline.expiryConstruction(nativeForeign)?.unchanged,true);assert.equal(WriterDeadline.expiryConstruction(donorWrapper),undefined);const foreign=kind==="native"?nativeForeign:donorWrapper;
  const forwarded=await receiver.run(Promise.reject(nativeForeign)).catch(error=>error);assert.strictEqual(forwarded,nativeForeign);assert.equal(receiver.signal.aborted,false);assert.equal(receiver.signal.reason,undefined);receiver.dispose();
  const before:WriterCausalFrame=WriterDeadline.inspectCausal(donorWrapper)!;assert.ok(before.settlements.includes(P));
  const beforeRows=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()]));const beforeBytes=BSON.serialize(beforeRows,{ignoreUndefined:false});
  graph.invoke=((...args:Parameters<typeof savedInvoke>)=>{receiverSignal=args[1]?.signal;return savedInvoke(...args);}) as typeof graph.invoke;
  checkpoints.findOne=((...args:Parameters<typeof savedFind>)=>{const filter=args[0] as Record<string,unknown>;if(!once||filter.tenantId!=="scribe-test"||filter.thread_id!==targetThread||typeof filter.checkpoint_id!=="string"||typeof filter.checkpoint_ns!=="string")return savedFind(...args);once=false;const operation=(async()=>{const actual=await savedFind(...args);assert.equal(actual,null);hitR();await Rheld;throw foreign;})();R=operation;void operation.catch(()=>undefined);return operation;}) as typeof checkpoints.findOne;
  receiverAttempt=startScribe(graph,baseInput({sessionId:`session-${targetThread}`}),{threadId:targetThread,writerDeadlineMs:200}).then(value=>({value}),error=>({error}));const stage=await Promise.race([Rready.then(()=>({reached:true})),receiverAttempt]);assert.ok("reached"in stage&&R);const terminal=await receiverAttempt;assert.ok("error"in terminal&&terminal.error instanceof FencedWriterDeadlineError);if(!("error"in terminal)||!(terminal.error instanceof FencedWriterDeadlineError))throw new Error("real receiver original deadline not reached");receiverError=terminal.error;assert.notStrictEqual(receiverSignal!.reason,nativeForeign);
  closeReceiver=receiverError.settled.then(value=>{receiverDone=true;return{value};},error=>{receiverDone=true;return{error};});openR();await assert.rejects(R,error=>error===foreign);await new Promise<void>(resolve=>setImmediate(resolve));
  if(kind==="wrapper-PQ"){
   assert.equal(receiverDone,false,"real receiver joined explicit foreign E.settled P");Object.defineProperty(donorWrapper,"settled",{value:Q,writable:true,configurable:true});const after=WriterDeadline.inspectCausal(donorWrapper,before)!;assert.equal(after.unchanged,false);assert.ok(before.settlements.includes(P));assert.ok(after.settlements.includes(Q));
   openA();await P;await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(receiverDone,false,"captured real P closes while later current Q still holds public drain");failQ(S);
  }else{failQ(S); /* Helper A is NOT a dependency of bare nativeE; no ancestry bridge inferred. */}
  const closureResult=await closeReceiver;assert.ok("error"in closureResult&&closureResult.error instanceof AggregateError);if(!("error"in closureResult)||!(closureResult.error instanceof AggregateError))throw new Error("foreign E was adopted as own expiry");assert.equal(closureResult.error.message,"Scribe original settlement and owned compensation failed.");
  const queue:unknown[]=[closureResult.error];const visited=new Set<unknown>();for(let index=0;index<queue.length;index++){const value=queue[index];if(visited.has(value))continue;visited.add(value);if(value===null||(typeof value!=="object"&&typeof value!=="function")||nativeTypes.isProxy(value))continue;for(const field of ["cause","errors","settled"]){const descriptor=Object.getOwnPropertyDescriptor(value,field);if(descriptor&&Object.hasOwn(descriptor,"value"))queue.push(descriptor.value);}if(Array.isArray(value))for(const key of Reflect.ownKeys(value)){if(typeof key!=="string"||! /^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=4294967295)continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor&&Object.hasOwn(descriptor,"value"))queue.push(descriptor.value);}}
  assert.ok(visited.has(foreign));assert.ok(visited.has(nativeForeign));if(kind==="wrapper-PQ")assert.ok(visited.has(S));
  const afterRows=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()]));assert.deepEqual(afterRows,beforeRows);assert.deepEqual(BSON.serialize(afterRows,{ignoreUndefined:false}),beforeBytes);
 }finally{openA();openR();failQ(S);audits.insertOne=savedInsert;checkpoints.findOne=savedFind;graph.invoke=savedInvoke;receiver.dispose();await Promise.allSettled([...(A?[A]:[]),...(R?[R]:[]),...(donorAttempt?[donorAttempt]:[]),...(receiverAttempt?[receiverAttempt]:[]),...(donorWrapper?[Object.getOwnPropertyDescriptor(donorWrapper,"settled")!.value]:[]),...(receiverError?[receiverError.settled]:[]),Q]);}
}
```

## H-061  src 3419-3420  [tests (see heading)]  CURRENT complete test packet — Part4 retained original proposal and FINAL correction

Anchor: FINAL mandatory Part4 correction (exact finite substitutions, same real controls): 1. Outer beside donorWrapper add let donorP:Promise<unknown>|undefined. 2. Capture replaces const P=... with:

```ts
const P = donorP = Object.getOwnPropertyDescriptor(donorWrapper, "settled")!.value as Promise<unknown>;
```

## H-062  src 3424-3434  [tests (see heading)]  CURRENT complete test packet — Part4 retained original proposal and FINAL correction

Anchor: All native-brand/Pdone/previous frame/receiver identity/release assertions unchanged. 3. Unconditional finally awaited array becomes:

```ts
await Promise.allSettled([
  ...(A ? [A] : []),
  ...(R ? [R] : []),
  ...(donorAttempt ? [donorAttempt] : []),
  ...(receiverAttempt ? [receiverAttempt] : []),
  ...(donorP ? [donorP] : []),
  ...(donorWrapper ? [Object.getOwnPropertyDescriptor(donorWrapper, "settled")!.value] : []),
  ...(receiverError ? [receiverError.settled] : []),
  Q,
]);
```

## H-063  src 3447-3489  [tests (see heading)]  FINAL test Part5a — every-poison negative inside existing2202 shapeDeadline try

Anchor: Append after Part2 mutation cases BEFORE finally dispose:

```ts
let everyRoot: FencedWriterDeadlineError | undefined;
try { shapeDeadline.op(); } catch (error) {
  assert.ok(error instanceof FencedWriterDeadlineError);
  everyRoot = error;
}
assert.ok(everyRoot);
const everyBirth = WriterDeadline.expiryConstruction(everyRoot);
assert.ok(everyBirth);
assert.equal(everyBirth.unchanged, true);
const everySettled = Object.getOwnPropertyDescriptor(everyRoot, "settled");
assert.ok(everySettled && "value" in everySettled);
const everyP = everySettled.value as Promise<unknown>;
const everyQ = Promise.resolve(undefined);
assert.notEqual(everyP, everyQ);
const savedEvery = Object.getOwnPropertyDescriptor(Array.prototype, "every");
assert.ok(savedEvery && "value" in savedEvery);
let poisonedUnchanged: boolean | undefined;
try {
  Object.defineProperty(everyRoot, "settled", {
    value: everyQ,
    writable: everySettled.writable,
    enumerable: everySettled.enumerable,
    configurable: everySettled.configurable,
  });
  Object.defineProperty(Array.prototype, "every", {
    value: function () { return true; },
    writable: savedEvery.writable,
    enumerable: savedEvery.enumerable,
    configurable: savedEvery.configurable,
  });
  poisonedUnchanged = WriterDeadline.expiryConstruction(everyRoot)?.unchanged;
} finally {
  Object.defineProperty(Array.prototype, "every", savedEvery);
}
assert.equal(poisonedUnchanged, false);
const restoredEvery = Object.getOwnPropertyDescriptor(Array.prototype, "every")!;
assert.equal(restoredEvery.value, savedEvery.value);
assert.equal(restoredEvery.writable, savedEvery.writable);
assert.equal(restoredEvery.enumerable, savedEvery.enumerable);
assert.equal(restoredEvery.configurable, savedEvery.configurable);
assert.equal(Object.getOwnPropertyDescriptor(everyRoot, "settled")!.value, everyQ);
await Promise.allSettled([everyP, everyQ]);
```

## H-064  src 3501-3502  [tests (see heading)]  FINAL test Part5b — exact runtime selector union and unchanged budgets

Anchor: normalcheckpointer122 tail after435-437 before438, non-normal139-433 untouched. No new titles/import statements beyond named existing imports/helpers/files. Old exact128 pattern alternatives retained firstfour. Prospective exact union:

```ts
^(?:D068 .+|D058 (?:transcript|concern) rejected receipt: actual late (?:owned insertion leaves zero residue|matched recreated winner preserves full rows)|D059 applyApprovedDiff dynamic postcheck: (?:successful|failed) work then expired budget preserves exact read undo priority|D059 applyApprovedDiff actual partial wrapper: (?:clean-own-expiry|unexpected-raw) preserves provenance and immutable primary|D-016 deadline: a writer that exceeds its deadline is ABORTED and COMPENSATED \(typed error; its in-flight insert is undone when it lands; every op carried a driver timeoutMS\)|D-016 deadline: the post-check runs AT the abort \(in the finally\), not only when the stuck op settles: a fact that landed before the stuck edge write is already gone when the writer returns|ISS-t-007-rev-6 / B14: the REAL MongoDBSaver persists a scribe run into the fake db; a FRESH saver on the same db reads the paused thread back and completes it)$
```

## H-065  src 3564-3592  [packages/engine/src/scribe/nodes.ts]  Amendment N — nodes classifier and happy-terminal proof

Anchor: Author expiry_nodes_plan; nodes source5DC65C2316A722DFF566CA23FF26696E34DEA204C42F1183430C339A0A44684D. Replace ONLY existing writeApproved1544–1549 unsafe PartialApplyError.cause classification with:

```ts
} catch(err){
 const frame=observeCausal(err);let partialCause:unknown;let partialCauseProved=false;
 if(err instanceof PartialApplyError&&frame&&!frame.unsafe&&!frame.failed&&!causalTainted.has(err)){
  try{
   const birth=WriterDeadline.expiryConstruction(err);let intact=!(birth&&!birth.unchanged);
   for(const previous of causalHistory.get(err)??[]){
    const current=WriterDeadline.inspectCausal(err,previous);
    if(!current||current.unsafe||current.failed||!current.unchanged){
     intact=false;causalTainted.add(err);if(current?.failed)noteFault(current.failure);
    }
   }
   const current=WriterDeadline.inspectCausal(err,frame);
   if(!current||current.unsafe||current.failed||!current.unchanged){
    intact=false;causalTainted.add(err);if(current?.failed)noteFault(current.failure);
   }
   const ownCause=current?.descriptors[0];
   if(intact&&!causalTainted.has(err)&&ownCause&&observationHasOwn(ownCause,'value')){
    partialCause=ownCause.value;partialCauseProved=true;
   }
  }catch(fault){causalTainted.add(err);noteFault(fault);}
 }
 if(err instanceof FactConflictError)result=ScribeResultSchema.parse({status:'conflict',key:err.key,message:err.message});
 else if(partialCauseProved&&partialCause instanceof FactConflictError)result=ScribeResultSchema.parse({
  status:'partial_conflict',key:(err as PartialApplyError).failingKey,
  writtenFactIds:(err as PartialApplyError).writtenIds,message:partialCause.message,
 });
 else throw err;
}
```

## H-066  src 3605-3611  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: Author expiry_decisions_plan; source ECB9B520FC1A1214AAE9E68A0F3A59F2005C7996354D6EDA10DB69BCCB5699E8. Only existing recordRejectReasons103. The original source/no-fault behavior, all fixed timed-out public envelopes, replay/duplicate ownership and actual P identities remain. R1 first ingress at actual insert catch183 BEFORE duplicate classification; actual209 binding is authorityErr (withdraw erroneous err209 map):

```ts
} catch(err){
 observeCausal(err);
 if(!isDuplicateKey(err))throw err;
 // SAME remaining duplicate-winner logic.
}
catch(authorityErr){observeCausal(authorityErr);authorityLoss={err:authorityErr};throw authorityErr;}
```

## H-067  src 3618-3637  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: Thirty original first-ingress patterns become31 with183; every other original map unchanged. R2 DELETE prior proposed fault-surface after352–355. Insert immediately BEFORE original352–355 priority throws:

```ts
const terminalObserverFaults=[...new Set<unknown>([
 ...expiryObserverFailures,...causalObserverFailures,
])];
if(terminalObserverFaults.length){
 const terminalRoots=[...new Set<unknown>([
  ...immediateUndoFailures,
  ...(postcheckFailure?[postcheckFailure.err]:[]),
  ...(authorityLoss?[authorityLoss.err]:[]),
  ...(failure?[failure.err]:[]),
  ...terminalObserverFaults,
 ])];
 if(terminalRoots.length===1)throw terminalRoots[0];
 throw new AggregateError(terminalRoots,"recordRejectReasons: causal observation failed");
}
if(immediateUndoFailures.length)throw immediateUndoFailures[0];
if(postcheckFailure)throw postcheckFailure.err;
if(authorityLoss)throw authorityLoss.err;
if(failure)throw failure.err;
return {recorded:true,_id};
```

## H-068  src 3644-3647  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: No new fault => original priority, throw identities and return exactly preserved. With fault => all actual original terminal roots in original priority order plus actual faults, exact identity dedup; sole root including undefined is unchanged. Normal fault-only owned-cleanup policy is separately unresolved until the author's finite addition below; no row oracle is inferred from this R2 alone. R3 collector-local outcome ledgers near268–270 BEFORE firstawait271:

```ts
const completedOutcomes=new Map<Promise<unknown>,PromiseSettledResult<unknown>>();
const forcedSettlementParents=new Set<unknown>();
const forcedOutcomeEdges=new Map<unknown,Set<Promise<unknown>>>();
```

## H-069  src 3652-3658  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: Replace actual work-outcome273, preserving SAME Promise.allSettled([work])271:

```ts
for(const outcome of workOutcome){
 completedOutcomes.set(work,outcome);
 if(outcome.status==="rejected"){
  observeCausal(outcome.reason);originalFailures.push(outcome.reason);
 }
}
```

## H-070  src 3663-3671  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: Replace original batch276 positional loop, preserving SAME slice/cursor and oneawait:

```ts
const outcomes=await Promise.allSettled(batch);
for(let index=0;index<outcomes.length;index++){
 const outcome=outcomes[index]!;
 completedOutcomes.set(batch[index]!,outcome);
 if(outcome.status==="rejected"){
  observeCausal(outcome.reason);originalFailures.push(outcome.reason);
 }
}
```

## H-071  src 3676-3686  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: Replace nested331–334 outcomes, preserving nestedbatch329/furtherErrors330 and stackpush335:

```ts
const outcomes=await Promise.allSettled(batch);
for(let index=0;index<outcomes.length;index++){
 const outcome=outcomes[index]!;
 completedOutcomes.set(batch[index]!,outcome);
 if(outcome.status==="rejected"){
  observeCausal(outcome.reason);
  if(!errors.includes(outcome.reason))errors.push(outcome.reason);
  furtherErrors.push(outcome.reason);
 }
}
```

## H-072  src 3691-3723  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: R4 complete replacement of proposed discovery310–318; forcing precedes revision skip:

```ts
const error=errorStack.pop();
observeCausal(error);
const history=causalHistory.get(error);
if(history){
 for(const promise of history.settlements){
  if(promise===settled)continue;
  const completed=completedOutcomes.get(promise);
  if(completed?.status!=="rejected")continue;
  let forcedEdges=forcedOutcomeEdges.get(error);
  if(!forcedEdges){forcedEdges=new Set();forcedOutcomeEdges.set(error,forcedEdges);}
  if(forcedEdges.has(promise))continue;
  forcedEdges.add(promise);
  forcedSettlementParents.add(error);
  if(!errors.includes(error))errors.push(error);
  if(!errors.includes(completed.reason))errors.push(completed.reason);
  observeCausal(completed.reason);errorStack.push(completed.reason);
 }
}
const revision=history?.revision??0;
if(errorSeen.get(error)===revision)continue;
errorSeen.set(error,revision);
if(history){
 for(const promise of history.settlements){
  if(promise===settled)continue;
  if(completedOutcomes.has(promise))continue;
  if(nestedSeen.has(promise as Promise<void>))continue;
  // SAME original nativeobserver N(promise), BOTH handlers undefined.
  nestedSeen.add(promise as Promise<void>);nested.push(promise as Promise<void>);
 }
 const descendants=[...history.children];
 for(let index=descendants.length-1;index>=0;index--)errorStack.push(descendants[index]);
}
```

## H-073  src 3730-3733  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: DELETE naked work/originalOperations identity exclusions. A known identity without actual recorded completed outcome must join normally. Fulfilled actual completed P can skip; rejected completed P forces SAME parent and actual reason before skip, including rejection undefined. Per-parent/P forcededge recorded before queue prevents reason===parent cycling. Requeue retained roots after actual awaits so unchanged-revision late parents are forced. R5 both classifiers278–292 and final repeated proof before337 add this negative BEFORE existing own positive:

```ts
if(forcedSettlementParents.has(leaf)||causalTaints.has(leaf)||history?.tainted||(construction&&!construction.unchanged)||!ownExpiryFailures.has(leaf)){
 expectedOnly=false;break;
}
```

## H-074  src 3738-3741  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: Direct-driver first-subscription additions are explicit scope and census9->11 (31 ingresses unchanged). At182 replace only driver await with:

```ts
const inserting=coll.insertOne(doc,insertBudget);
// SAME nativeobserver N(inserting), BEFORE actual await.
await inserting;
```

## H-075  src 3746-3749  [packages/db/src/decisions.ts]  Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Anchor: At202–203 replace only winner driver await with:

```ts
const winnerRead=coll.findOne({_id,studentId:input.studentId,threadId:input.threadId,kind:"per_fact_reject"},winnerBudget);
// SAME nativeobserver N(winnerRead), BEFORE actual await.
const winner=await winnerRead;
```

## H-076  src 3758-3759  [packages/engine/src/scribe/graph.ts]  Amendment G1 — discovered native settlements and no-consent crisis seams

Anchor: Prospective source-based packet from /root/graph_plan_ready; NOT approval, source GO, execution or acceptance. Frozen graph source 9AC10E0C1A6FB5B6284DF50A9C7A88C5F71E1FC0D14CA21287A8BF3F8D2C1E2B. In eight existing `for (const operation of unjoined) joined.add(operation)` loops before batch allSettled at source930/1241/1366/1635/1711/1857/2422/2762, replace only the loop body with:

```ts
{ observeGraphOriginal(CONTEXT, operation); joined.add(operation); }
```

## H-077  src 3766-3781  [packages/engine/src/scribe/graph.ts]  Amendment G1 — discovered native settlements and no-consent crisis seams

Anchor: CONTEXT is respectively owner/createdCall/createdCall/created/created/owner/invocationCreated/causal. P is the genuine discovered native settlement from the inspector. Existing exact SELF/drained bypass remains before discovery. Observer children never join or enroll as raw originals/receipts. There is no extra original push. At existing no-consent source1156, use the same actual call, IDs, flag processing, signal and deadline:

```ts
if (turnIds.length > 0 && deps.escalation) {
  const original = escalateTurns(deps.db, parsed, {
    ...deps.escalation,
    budget: {
      expiresAt: deadline.expiresAt,
      signal: deadline.signal,
      run: work => {
        observeGraphOriginal(createdCall, work);
        return deadline.run(work);
      }
    }
  });
  observeGraphOriginal(createdCall, original);
  await deadline.run(original);
}
```

## H-078  src 3790-3803  [packages/engine/src/scribe/graph.ts]  Amendment G2 — sticky observed detached causal roots

Anchor: Add optional `detachedCausalRoots?: Set<unknown>` to existing GraphCausalContext. Initialize a new Set at actual contexts777/1134/2029/2594; alias the SAME set everywhere causalHistory aliases owner/recovery. No module-global history. Capture `const graphSame = Object.is` beside the existing inert intrinsic declarations. In rememberGraphCausal after `if (!frame) continue;`, before `if (next === 0) first = frame`, insert:

```ts
if (previous && !frame.unchanged) {
  for (let version = 0; version < (history?.length ?? 0); version++) {
    const oldFrame = history![version]!;
    for (let child = 0; child < oldFrame.children.length; child++) {
      const removed = oldFrame.children[child];
      let present = false;
      for (let now = 0; now < frame.children.length; now++) {
        if (graphSame(removed, frame.children[now])) { present = true; break; }
      }
      if (!present) graphApply(graphSetAdd, context.detachedCausalRoots!, [removed]);
    }
  }
}
```

## H-079  src 3808-3812  [see heading]  Amendment G2 — sticky observed detached causal roots

Anchor: Never clear on restoration. Unchanged frames do not detach/flatten children. Before every capturePass in the seven root/forced collectors924/1237/1362/1631/1707/1853/2418, with contexts owner/createdCall/createdCall/created/created/owner/invocationCreated respectively, insert:

```ts
for (const detached of CONTEXT.detachedCausalRoots!) {
  roots.add(detached);
  forced.add(detached);
}
```

## H-080  src 3817-3824  [see heading]  Amendment G2 — sticky observed detached causal roots

Anchor: Inspect before capturePass uses:

```ts
for (const detached of causal.detachedCausalRoots!) {
  if (!metadataFailures.has(detached)) {
    metadataFailures.add(detached);
    errors.push(detached);
    executions.push(detached);
  }
}
```

## H-081  src 3833-3845  [packages/db/src/facts.ts]  Amendment F1 — apply ordinary precheck fault terminal and typed closure identity

Anchor: Prospective source-based packet from /root/facts_plan_ready; NOT recovered historical authority, approval or source GO. Frozen facts18F59B7B75555CE2F5C69AB163C85E4B3DA5BFDAD3B6D897A4EB80C1DD99F5AC. Retain the complete preceding metadata/60-site/collector revision hunks. At apply precheck catch439, before the SAME planned first collector:

```ts
const expiredAtEntry = deadline.expired();
if (!expiredAtEntry && !provenanceFailures.length) throw err;
let primary: unknown[];
if (expiredAtEntry) {
  const expiryError: unknown = await originalExpiry.catch(error => {
    observeCausal(error); return error;
  });
  ownExpiryFailures.add(expiryError);
  primary = [...new Set<unknown>([...(err === expiryError ? [] : [err]), expiryError, ...provenanceFailures])];
} else primary = [...new Set<unknown>([err, ...provenanceFailures])];
let closedErrors: unknown[] | undefined;
let closedFailure: { error: unknown } | undefined;
```

## H-082  src 3850-3856  [see heading]  Amendment F1 — apply ordinary precheck fault terminal and typed closure identity

Anchor: At that collector's final errors seal replace the sole throw with:

```ts
closedErrors = errors.slice();
if (errors.length) {
  const terminal = new AggregateError(errors, "applyApprovedDiff: timed-out writer settlement failed");
  closedFailure = { error: terminal };
  throw terminal;
}
```

## H-083  src 3861-3875  [see heading]  Amendment F1 — apply ordinary precheck fault terminal and typed closure identity

Anchor: Collector cleanup remains unchanged (this collector has none). After handled SAME settled, before existing cause/FWD emission:

```ts
if (!expiredAtEntry) {
  let closureFailure: { error: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (error) { observeCausal(error); closureFailure = { error }; }
  const roots = [...new Set<unknown>([
    ...primary, ...(closedErrors ?? []), ...provenanceFailures,
    ...(closureFailure && !(closedFailure && closureFailure.error === closedFailure.error) ? [closureFailure.error] : [])
  ])];
  primary = roots;
  if (!(deadline.expired() && closedErrors === undefined)) {
    if (roots.length === 1) throw roots[0];
    throw new AggregateError(roots, "applyApprovedDiff: causal observation failed");
  }
}
```

## H-084  src 3884-3901  [see heading]  Amendment F2 — apply main success/error fault closure

Anchor: At MAIN931–1015 replace ONLY source931 `if (deadline.expired())` with `const expiredAtEntry = deadline.expired(); if (expiredAtEntry || provenanceFailures.length) {`. Other deadline guards are unchanged; immediate undo stays once guarded. Primary is:

```ts
let primary: unknown[];
if (expiredAtEntry) {
  const expiryError: unknown = await originalExpiry.catch(error => {
    observeCausal(error); return error;
  });
  ownExpiryFailures.add(expiryError);
  primary = [...new Set<unknown>([
    ...(failure && failure.err !== expiryError ? [failure.err] : []), expiryError,
    ...(postcheckFailure ? [postcheckFailure.err] : []),
    ...(authorityLoss ? [authorityLoss.err] : []), ...immediateUndoFailures, ...provenanceFailures
  ])];
} else primary = [...new Set<unknown>([
  ...(failure ? [failure.err] : []), ...(postcheckFailure ? [postcheckFailure.err] : []),
  ...(authorityLoss ? [authorityLoss.err] : []), ...immediateUndoFailures, ...provenanceFailures
])];
let closedErrors: unknown[] | undefined;
let closedFailure: { error: unknown } | undefined;
```

## H-085  src 3912-3918  [see heading]  Amendment F3 — ensure normal/readonly fault closure

Anchor: No authorityLoss variable exists here. Add invocation-local `const closedSettlements = new Set<Promise<unknown>>();` beside settlementErrors1085. In the EXISTING ordinary cleanup1132 and readonly collector1598 exact-self bindings, at the final fixed-point seal before final errors throw/return, add `closedSettlements.add(settlement);` where settlement is the SAME actual local returned IIFE P, not an observer child; readonly retains settled=settlement. Replace success1594 with:

```ts
try {
  if (callbackFailure) throw callbackFailure.err;
  const result = await deadline.run(work);
  if (provenanceFailures.length) throw provenanceFailures[0];
  return result;
}
```

## H-086  src 3923-3943  [see heading]  Amendment F3 — ensure normal/readonly fault closure

Anchor: Existing catch executionFailure is unchanged. After each existing collector's handledness and before the old deadline.expired branch:

```ts
if (provenanceFailures.length && !deadline.expired()) {
  let closureFailure: { error: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (error) { observeCausal(error); closureFailure = { error }; }
  const recorded = closureFailure ? settlementErrors.get(closureFailure.error) : undefined;
  const roots = [...new Set<unknown>([
    error, ...provenanceFailures, ...(recorded ?? []),
    ...(closureFailure && !settlementErrors.has(closureFailure.error) ? [closureFailure.error] : [])
  ])];
  if (!(deadline.expired() && !closedSettlements.has(settled))) {
    if (roots.length === 1) throw roots[0];
    throw new AggregateError(roots, "Session admission failure and causal observation failed.");
  }
  const cause = roots.length === 1 ? roots[0] : new AggregateError(roots, "Session admission failure and causal observation failed.");
  const expired = new FencedWriterDeadlineError(settled, { cause });
  observeCausal(expired);
  try { options.onExpectedExpiry?.(expired, { wrappedCause: cause }); }
  catch (observerError) { observeCausal(observerError); provenanceFailures.push(observerError); }
  throw expired;
}
```

## H-087  src 3952-3960  [see heading]  Amendment F6 — three existing early callback guards

Anchor: At apply891 move existing nullable `failure` declaration before the callback (declaration only; result declaration may stay). Add:

```ts
let callbackFailure: { err: unknown } | undefined;
try { options.onOwnedWrite?.(undo, work); }
catch (err) {
  observeCausal(err);
  if (!provenanceFailures.length) throw err;
  callbackFailure = { err };
}
if (callbackFailure) failure = callbackFailure;
```

## H-088  src 3967-3976  [see heading]  Amendment F6 — three existing early callback guards

Anchor: Initial895 try becomes `try { if (!callbackFailure) result = await deadline.run(work); } catch (err) { observeCausal(err); failure = { err }; }`. Maincollector still joins SAME work and exact owned cleanup. At ensure1593:

```ts
let callbackFailure: { err: unknown } | undefined;
if (!options.summaryAdmissionOnly) {
  try { options.onOwnedWrite?.(cleanup, work); }
  catch (err) {
    observeCausal(err);
    if (!provenanceFailures.length) throw err;
    callbackFailure = { err };
  }
}
```

## H-089  src 3985-3990  [tests (see heading)]  Mandatory F6 ordering refinement — supersedes the three preceding callback catches

Anchor: The callback catch must test the PREEXISTING ledger before reflection of callback T. In all three F6 catches use exactly:

```ts
catch (err) {
  if (!provenanceFailures.length) throw err;
  observeCausal(err);
  callbackFailure = { err };
}
```

## H-090  src 3999-4005  [packages/engine/src/scribe/graph.ts]  Amendment G3 — real normal observer faults through existing cleanup paths (part1)

Anchor: Capture `const graphSetEach = Set.prototype.forEach;` beside inert intrinsics; one unique private helper in the existing graph module beside metadata adapters:

```ts
function throwGraphObserverFaults(context: GraphCausalContext): void {
  const faults: unknown[] = [];
  graphApply(graphSetEach, context.observerFailures!, [(fault: unknown) => { faults[faults.length] = fault; }]);
  if (faults.length === 1) throw faults[0];
  if (faults.length > 1) throw new AggregateError(faults, "Scribe native observation failed.");
}
```

## H-091  src 4012-4018  [packages/engine/src/scribe/graph.ts]  Amendment G3 — real normal observer faults through existing cleanup paths (part1)

Anchor: Undefined is an actual fault (length discriminates). No receipt callback, onExpectedExpiry, synthetic FWD or new deadline. Existing failure collectors union the entire observer ledger into roots+forced, retaining coexisting R separately. Normal exits call this gate inside their existing try/cleanup path, not outside it. Owner catch1015 begins rememberGraphCausal(owner,err), preserving original thrown R. After authorization catch1026 closes, before existing settled1032:

```ts
try { throwGraphObserverFaults(owner); }
catch (err) {
  rememberGraphCausal(owner, err);
  thrown ??= { err };
  if (deadline.expired()) timedOut = true;
}
```

## H-092  src 4031-4036  [packages/db/src/decisions.ts]  Amendment R6/R7 — decisions fault-only owned cleanup and existing collector reuse

Anchor: Prospective packet from /root/decisions_plan_ready; frozen decisionsECB9B520FC1A1214AAE9E68A0F3A59F2005C7996354D6EDA10DB69BCCB5699E8. Undo140–144 remains SAME selector `_id, studentId, threadId, kind: "per_fact_reject", writerToken` and SAME deleteMany. At242 extend ONLY alwaysUndo to `deadline.expired() || !!authorityLoss || expiryObserverFailures.length > 0 || causalObserverFailures.length > 0`. After authorization20 block254, before255:

```ts
if ((expiryObserverFailures.length || causalObserverFailures.length) && !immediateUndoAttempted) {
  immediateUndoAttempted = true;
  try { await undo(); }
  catch (error) { observeCausal(error); immediateUndoFailures.push(error); }
}
```

## H-093  src 4041-4058  [packages/db/src/decisions.ts]  Amendment R6/R7 — decisions fault-only owned cleanup and existing collector reuse

Anchor: Original timer remains live throughout actual cleanup, with no deadline.op, synthetic expiry, renewed deadline, broad delete or refreshed authorization. Change255 outer condition to `if (deadline.expired() || expiryObserverFailures.length || causalObserverFailures.length)`. Keep existing immediate undo guard256–259. Replace unconditional expiry read/receipt260–263:

```ts
let hasExpiry = false;
let expiryError: unknown;
if (deadline.expired()) {
  hasExpiry = true;
  expiryError = await originalExpiry.catch(error => error);
  ownExpiryFailures.add(expiryError);
  try { options.onExpectedExpiry?.(expiryError); }
  catch (observerError) {
    observeCausal(observerError);
    if (!expiryObserverFailures.includes(observerError)) expiryObserverFailures.push(observerError);
  }
}
const primary = [...new Set<unknown>([
  ...(failure && (!hasExpiry || failure.err !== expiryError) ? [failure.err] : []),
  ...(hasExpiry ? [expiryError] : []), ...(postcheckFailure ? [postcheckFailure.err] : []),
  ...immediateUndoFailures, ...expiryObserverFailures, ...causalObserverFailures
])];
```

## H-094  src 4063-4070  [packages/db/src/decisions.ts]  Amendment R6/R7 — decisions fault-only owned cleanup and existing collector reuse

Anchor: Use the single existing settlement collector266–339 with R3–R5. Append both actual observer ledgers to discoverySeeds293–294; normal S joins authentic nested P/Q. Immediately after errors268:

```ts
if (!hasExpiry) {
  for (const root of [
    ...immediateUndoFailures, ...(postcheckFailure ? [postcheckFailure.err] : []),
    ...(authorityLoss ? [authorityLoss.err] : []), ...(failure ? [failure.err] : []),
    ...expiryObserverFailures, ...causalObserverFailures
  ]) if (!errors.includes(root)) errors.push(root);
}
```

## H-095  src 4075-4081  [packages/db/src/decisions.ts]  Amendment R6/R7 — decisions fault-only owned cleanup and existing collector reuse

Anchor: Existing postcheck269/immediate270 stay with identity dedup (guard existing postcheck push with `if (!errors.includes(postcheckFailure.err))`). Expired-at-entry ordering is unchanged. Normal S is explicitly unexpected, never classifier-suppressed. At337:

```ts
if (errors.length) {
  if (!deadline.expired() && errors.length === 1) throw errors[0];
  throw new AggregateError(errors, deadline.expired()
    ? "recordRejectReasons: timed-out writer settlement failed"
    : "recordRejectReasons: causal observation failed");
}
```

## H-096  src 4086-4111  [packages/db/src/decisions.ts]  Amendment R6/R7 — decisions fault-only owned cleanup and existing collector reuse

Anchor: Zero actual faults+unexpired bypasses collector exactly as before. Immediately after handled settled339, before cause340:

```ts
if (!hasExpiry) {
  let boundedFailure: { err: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (err) { boundedFailure = { err }; }
  if (!deadline.expired()) {
    if (boundedFailure) throw boundedFailure.err;
    const roots = [...new Set<unknown>([
      ...immediateUndoFailures, ...(postcheckFailure ? [postcheckFailure.err] : []),
      ...(authorityLoss ? [authorityLoss.err] : []), ...(failure ? [failure.err] : []),
      ...expiryObserverFailures, ...causalObserverFailures
    ])];
    if (roots.length === 1) throw roots[0];
    throw new AggregateError(roots, "recordRejectReasons: causal observation failed");
  }
  hasExpiry = true;
  expiryError = await originalExpiry.catch(error => error);
  ownExpiryFailures.add(expiryError);
  if (!primary.includes(expiryError)) primary.push(expiryError);
  if (boundedFailure && boundedFailure.err !== expiryError && !primary.includes(boundedFailure.err)) primary.push(boundedFailure.err);
  try { options.onExpectedExpiry?.(expiryError); }
  catch (observerError) {
    observeCausal(observerError);
    if (!expiryObserverFailures.includes(observerError)) expiryObserverFailures.push(observerError);
  }
}
```

## H-097  src 4120-4140  [packages/db/src/facts.ts]  Amendment F4/F5 — summary and deferredcommit fault closure

Anchor: Prospective source packet from /root/summary_fault_controls. Requires invocation-local `closedSettlements` and the exact memoized undoP fixed-point seal; no allSettled wrapper may substitute. In summary return2138, before return add `if (provenanceFailures.length) throw provenanceFailures[0];`. After the catch's exact memoized `const settled = undo(); selfSettlements.add(settled); void settled.catch(...)`, before timedOut:

```ts
if (provenanceFailures.length) {
  let closureFailure: { err: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (error) { closureFailure = { err: error }; }
  const errors: unknown[] = [err];
  if (authorityLoss) errors.push(authorityLoss.err);
  if (closureFailure) {
    if (settlementErrors.has(closureFailure.err)) errors.push(...settlementErrors.get(closureFailure.err)!.errors);
    else errors.push(closureFailure.err);
  }
  errors.push(...provenanceFailures);
  const failure = new AggregateError([...new Set<unknown>(errors)], "Session summary failure and owned cleanup failed.");
  if (deadline.expired() && !closedSettlements.has(settled)) {
    const expired = new FencedWriterDeadlineError(settled, { cause: failure });
    try { options.onExpectedExpiry?.(expired, { wrappedCause: expired.cause }); }
    catch (observerError) { provenanceFailures.push(observerError); }
    throw expired;
  }
  throw failure;
}
```

## H-098  src 4147-4177  [packages/db/src/facts.ts]  Amendment F4/F5 — summary and deferredcommit fault closure

Anchor: Race#5. No fault preserves original timedOut/settled/authority throw. Actual closureFailure undefined is retained by typed receipt plus map.has. Inside existing deferred commit callback1942–1976 wrap its current entire body, including expiresAt guard, unchanged:

```ts
let bodyFailure: { err: unknown } | undefined;
try { /* CURRENT BODY verbatim */ }
catch (err) { bodyFailure = { err }; }
if (!provenanceFailures.length) {
  if (bodyFailure) throw bodyFailure.err;
  return;
}
const settled = undo();
selfSettlements.add(settled);
void settled.catch(error => { observeCausal(error); return undefined; });
let closureFailure: { err: unknown } | undefined;
try { await operationOptions.deadline.run(settled); }
catch (err) { closureFailure = { err }; }
const errors: unknown[] = [];
if (bodyFailure) errors.push(bodyFailure.err);
if (closureFailure) {
  if (settlementErrors.has(closureFailure.err)) errors.push(...settlementErrors.get(closureFailure.err)!.errors);
  else errors.push(closureFailure.err);
}
errors.push(...provenanceFailures);
const failure = new AggregateError([...new Set<unknown>(errors)], "Session summary failure and owned cleanup failed.");
if (operationOptions.deadline.expired() && !closedSettlements.has(settled)) {
  const expired = new FencedWriterDeadlineError(settled, { cause: failure });
  if (operationOptions.deadline === deadline) {
    try { options.onExpectedExpiry?.(expired, { wrappedCause: expired.cause }); }
    catch (observerError) { provenanceFailures.push(observerError); }
  }
  throw expired;
}
throw failure;
```

## H-099  src 4192-4234  [packages/db/src/erasure.ts]  Amendment test L — isolated descriptor/undefined/inherited/nonnative controls

Anchor: Prospective packet from /root/test_plan_ready, not execution. Append inside the existing erasure callback2202 shapeDeadline try after original PART2 loop, no new test/helper/file:

```ts
for (const fault of ["flag-enumerable", "flag-configurable", "flag-writable", "kind", "own-cause-undefined", "native-vector-undefined", "inherited-DATA", "nonnative-settled"] as const) {
  let E: unknown;
  try { shapeDeadline.op(); } catch (error) { E = error; }
  assert.ok(E instanceof FencedWriterDeadlineError);
  const before = WriterDeadline.inspectCausal(E)!;
  const sd = Object.getOwnPropertyDescriptor(E, "settled")!;
  const P = sd.value;
  const inheritedC = new Error("PRIVATE_D070_INHERITED_DATA");
  let kindReads = 0;
  if (fault.startsWith("flag-")) {
    const flag = fault.slice(5) as "enumerable" | "configurable" | "writable";
    Object.defineProperty(E, "settled", { ...sd, [flag]: !sd[flag] });
  } else if (fault === "kind") Object.defineProperty(E, "settled", { configurable: true, enumerable: sd.enumerable, get: () => { kindReads++; return P; } });
  else if (fault === "own-cause-undefined") Object.defineProperty(E, "cause", { value: undefined, writable: true, configurable: true });
  else if (fault === "native-vector-undefined") {
    Object.setPrototypeOf(E, AggregateError.prototype);
    Object.defineProperty(E, "errors", { value: [undefined], writable: true, configurable: true });
  } else if (fault === "inherited-DATA") {
    const parent = Object.create(FencedWriterDeadlineError.prototype);
    Object.defineProperty(parent, "cause", { value: inheritedC, writable: true, configurable: true });
    Object.setPrototypeOf(E, parent);
  } else Object.defineProperty(E, "settled", { value: { then: () => assert.fail("nonnative settled must never assimilate") }, writable: true, configurable: true });
  const after = WriterDeadline.inspectCausal(E, before)!;
  assert.equal(after.unchanged, false);
  assert.equal(WriterDeadline.expiryConstruction(E)?.unchanged, false);
  assert.equal(after.failed, false);
  assert.equal(after.unsafe, fault === "kind" || fault === "nonnative-settled");
  if (fault === "own-cause-undefined" || fault === "native-vector-undefined") {
    assert.equal(after.children.length, 1);
    assert.strictEqual(after.children[0], undefined);
  }
  if (fault === "native-vector-undefined") {
    assert.equal(after.vector!.keys.length, 2);
    assert.deepEqual(after.vector!.keys, ["0", "length"]);
  }
  if (fault === "inherited-DATA") {
    assert.equal(Object.hasOwn(E, "cause"), false);
    assert.strictEqual(after.children[0], inheritedC);
  }
  assert.ok(before.settlements.includes(P));
  assert.equal(kindReads, 0);
}
```

## H-100  src 4265-4299  [packages/db/src/decisions.ts]  Amendment test D — actual native subscription fault base and owned-row oracle

Anchor: Append supplemental local scenarios AFTER all protected original healthy decisions callback41 assertions, not around/replacing them. Existing79 BSONidempotence/239heldcount1/290cleanup failure remain protected. Literal S-only base supplied by test owner:

```ts
{
  const { db: probeDb, fakeDb: probeFake, decisions: probeRows } = setup();
  const savedInsert = probeRows.insertOne.bind(probeRows);
  const S = new Error("PRIVATE_D070_REJECT_SUBSCRIPTION");
  let reads = 0, species = 0, stack: string | undefined;
  let raw: Promise<unknown> | undefined;
  let fired = false;
  const hostile = { get [Symbol.species]() { species++; stack = new Error().stack; throw S; } };
  probeRows.insertOne = ((...args: Parameters<typeof savedInsert>) => {
    const P = savedInsert(...args);
    if (!fired && args[0].threadId === "d070-reject-observer") {
      fired = true; raw = P;
      Object.defineProperty(P, "constructor", { configurable: true, get() { reads++; return reads === 1 ? hostile : Promise; } });
    }
    return P;
  }) as typeof probeRows.insertOne;
  try {
    const result = await recordRejectReasons(probeDb, {
      threadId: "d070-reject-observer", studentId: "d070-reject-student",
      rejected: [{ key: "major", reason: "private outcome" }]
    }).then(value => ({ value }), error => ({ error }));
    assert.ok(raw && fired);
    assert.equal(species, 1);
    assert.ok(reads >= 2);
    assert.ok("error" in result);
    if ("error" in result) assert.strictEqual(result.error, S);
    await raw;
    assert.deepEqual(probeRows.all(), []);
    // Exact production N(inserting) numeric stack assertion ONLY after actual source freeze.
  } finally {
    probeRows.insertOne = savedInsert;
    if (raw) await Promise.allSettled([raw]);
  }
}
```

## H-101  src 4318-4332  [packages/db/src/decisions.ts]  Mandatory R6 strict-deadline replacement — supersedes raw-await forced-S cleanup

Anchor: Prospective correction from decisions source owner. Application deadline/liveness D016 and B23.3/B15 remain binding. Add `let observationForcedPostcheck = false;` beside postcheckFailure230. At233–242 capture SAME existing actual call and preserve original selector/readtimeout/callback:

```ts
observationForcedPostcheck = expiryObserverFailures.length > 0 || causalObserverFailures.length > 0;
const postchecking = compensateIfFenced(db, input.studentId, async () => {
  immediateUndoAttempted = true;
  try { await undo(); }
  catch (error) { observeCausal(error); immediateUndoFailures.push(error); }
}, {
  ...(failure ? { cause: failure.err } : {}),
  alwaysUndo: deadline.expired() || !!authorityLoss || observationForcedPostcheck
});
if (observationForcedPostcheck) {
  if (!originalOperations.includes(postchecking)) originalOperations.push(postchecking);
  // SAME complete literal native observer N(postchecking), BOTH handlers undefined.
  await deadline.run(postchecking);
} else await postchecking;
```

## H-102  src 4337-4345  [see heading]  Mandatory R6 strict-deadline replacement — supersedes raw-await forced-S cleanup

Anchor: Existing catch243 becomes:

```ts
catch (error) {
  observeCausal(error);
  if (observationForcedPostcheck && deadline.expired()) {
    const actualExpiry = await originalExpiry.catch(reason => reason);
    ownExpiryFailures.add(actualExpiry);
    if (error !== actualExpiry) postcheckFailure = { err: error };
  } else postcheckFailure = { err: error };
}
```

## H-103  src 4352-4367  [see heading]  Mandatory R6 strict-deadline replacement — supersedes raw-await forced-S cleanup

Anchor: Actual raced E is not an unexpected postcheck fault; distinct S/R remain. Held postchecking is tracked ORIGINAL for R3 collector; real FWD can precede raw cleanup release with SAME settled pending. After254, before255, replace preceding bare-awaitundo fault branch:

```ts
if ((expiryObserverFailures.length || causalObserverFailures.length) && !immediateUndoAttempted) {
  immediateUndoAttempted = true;
  const cleaning = undo();
  if (!originalOperations.includes(cleaning)) originalOperations.push(cleaning);
  // SAME complete literal native observer N(cleaning), BOTH handlers undefined.
  try { await deadline.run(cleaning); }
  catch (error) {
    observeCausal(error);
    if (deadline.expired()) {
      const actualExpiry = await originalExpiry.catch(reason => reason);
      ownExpiryFailures.add(actualExpiry);
      if (error !== actualExpiry) immediateUndoFailures.push(error);
    } else immediateUndoFailures.push(error);
  }
}
```

## H-104  src 4376-4382  [packages/db/src/decisions.ts]  Mandatory R6 strict-deadline replacement — supersedes raw-await forced-S cleanup

Anchor: her observer ledger is nonempty, push SAME authorityCleaning into originalOperations if absent, attach SAME native N(authorityCleaning), await deadline.run(authorityCleaning); otherwise await SAME authorityCleaning as old undo. Catch first observes actual error; when fault-forced+expired compare SAME actualExpiry and add only distinct C to immediateUndoFailures; otherwise old actual push. No second call/authrefresh. Third explicit nativeattachment makes decisions static census11->14. Track actual postchecking and executed cleaning/authorityCleaning, not nativeThen children. Add `let undoFailuresDrained = 0;` beside nestedDrained298. In existing collector loop before302 observer-ledger drain:

```ts
while (undoFailuresDrained < immediateUndoFailures.length) {
  const error = immediateUndoFailures[undoFailuresDrained++];
  observeCausal(error);
  if (!errors.includes(error)) errors.push(error);
  errorStack.push(error);
}
```

## H-105  src 4393-4401  [tests (see heading)]  Amendment test S — actual observed drift restored before native Q join

Anchor: Finite literal control from /root/native_subscription_injector in the EXISTING normalcheckpointer callback122 tail (original packet3319+). Add `observed-restored` fault union literal and ONLY one matrix row `["sync", "observed-restored"]`. Existing leaf is independent C. After3326 existing Q.catch (BEFORE any constructor poison), add:

```ts
const independentS = new Error("PRIVATE_CAUSAL_Q_S_NO_C");
let qConstructorReads = 0;
let qRestoreStack: string | undefined;
let qRestored = false;
let savedCause: PropertyDescriptor | undefined;
let savedErrors: PropertyDescriptor | undefined;
let savedSettled: PropertyDescriptor | undefined;
let savedPrototype: object | null = null;
```

## H-106  src 4406-4432  [tests (see heading)]  Amendment test S — actual observed drift restored before native Q join

Anchor: Add mutate branch before pregel:

```ts
else if (fault === "observed-restored") {
  savedCause = Object.getOwnPropertyDescriptor(reason, "cause");
  savedErrors = Object.getOwnPropertyDescriptor(reason, "errors");
  savedSettled = Object.getOwnPropertyDescriptor(reason, "settled");
  savedPrototype = Object.getPrototypeOf(reason) as object | null;
  Object.defineProperty(reason, "cause", { value: leaf, writable: true, configurable: true });
  Object.defineProperty(reason, "settled", { value: Q, writable: true, configurable: true });
  QUsed = true;
  Object.defineProperty(Q, "constructor", {
    configurable: true,
    get() {
      if (++qConstructorReads === 1) {
        qRestoreStack = new Error().stack;
        assert.strictEqual(Object.getOwnPropertyDescriptor(reason, "cause")?.value, leaf);
        assert.strictEqual(Object.getOwnPropertyDescriptor(reason, "settled")?.value, Q);
        Object.setPrototypeOf(reason, savedPrototype);
        for (const [key, descriptor] of [["cause", savedCause], ["errors", savedErrors], ["settled", savedSettled]] as const) {
          if (descriptor) Object.defineProperty(reason, key, descriptor);
          else assert.equal(Reflect.deleteProperty(reason as object, key), true);
        }
        qRestored = true;
      }
      return Promise;
    }
  });
}
```

## H-107  src 4439-4449  [tests (see heading)]  Amendment test S — actual observed drift restored before native Q join

Anchor: Existing onAbort birth precedes mutate, no new onAbort callback. Source observeCausal(E) captures C/Q before N(Q). NativeThen successfully reads Q.constructor and restores original E after capture, before actual join. No test subscription/await/catch/resolve/allSettled may touch Q while the getter is active. Getter returns stock Promise and causes no subscription fault. At3349 changed becomes `const changed = !["clean", "pregel", "revoked-raw", "observed-restored"].includes(fault);`. Sticky E CURRENT shape and authentic birth are restored/unchanged; historical taint alone must refuse it. After3349:

```ts
if (fault === "observed-restored") {
  assert.ok(qRestored);
  assert.ok(qConstructorReads >= 1);
  assert.ok(qRestoreStack);
  assert.strictEqual(Object.getPrototypeOf(reason), savedPrototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(reason, "cause"), savedCause);
  assert.deepEqual(Object.getOwnPropertyDescriptor(reason, "errors"), savedErrors);
  assert.deepEqual(Object.getOwnPropertyDescriptor(reason, "settled"), savedSettled);
  assert.equal(Object.getOwnPropertyDescriptor(independentS, "cause"), undefined);
}
```

## H-108  src 4454-4458  [tests (see heading)]  Amendment test S — actual observed drift restored before native Q join

Anchor: Add exact actual production N(Q) stack frame assertion ONLY after final measured source freeze. Guessed numeric/family pins do not count. Replace BOTH rejectQ(leaf) at3352 with `rejectQ(fault === "observed-restored" ? independentS : leaf)`; preserve actual pendingQ/closureDonefalse. After3362 public DAG assertions:

```ts
if (fault === "observed-restored") {
  assert.ok(seen.has(leaf), "restored-away C retained independently of Q rejection");
  assert.ok(seen.has(independentS), "actual Q rejection S retained without cause C");
}
```

## H-109  src 4469-4470  [packages/db/src/erasure.ts]  Prospective expanded test selectors and unchanged boundaries

Anchor: Test owner scope is only EXISTING erasure callbacks1611/2202; saver NORMAL122tail435–438; facts receipt1781/admission1978/2022/standalone2095/2143; decisions healthy41/idempotent79/held239/290. Protected original128 graph/16 adapter/33 persistence/D069 assertions AND budgets byte-preserved. New lowlevel8/compiled8 sync rows plus sticky1 are supplemental, not replacements. Summary14old+8new native/deferred/early and admission controls need their full finite exact packet before whole freeze. After WHOLE prospective approval only, proposed db selection:

```ts
pnpm --filter @vc/db exec tsx --test --test-name-pattern='D-016 deadline: a writer that exceeds|D-016 deadline: the post-check runs AT|D068 admission|D068 summary|D048 standalone|recordRejectReasons: writes the thread id|recordRejectReasons: idempotent under the SAME|D044 rejection leaf' tests/erasure.test.ts tests/facts.test.ts tests/decisions.test.ts
```

## H-110  src 4481-4505  [packages/engine/src/scribe/nodes.ts]  Amendment G6 — swallowed postcheck discovery frontier, finite deep causal routing

Anchor: er explicit unresolved postcheck744 gap with this prospective private plan; still no approval/source GO. In existing invokeFenceAware bind `const postCheckFrontier = new Set<unknown>();` beside owner setup before compensate closure. Private fencedForPostCheck signature is `(db, studentId, causalContext: GraphCausalContext, frontier: Set<unknown>)`; sole1023call passes SAME owner/postCheckFrontier. Catch744 first remembers actual R, captured Set.add(frontier,R), then returns SAME fail-safe true. Only owner compensate924 collector gains local `const postCheckNodes = new Set<unknown>();` beside roots/forced. Each round, after fault/detached ledger merge and BEFORE original main queue/discovery:

```ts
const frontierQueue: unknown[] = [...postCheckFrontier];
const frontierPass = new Set<unknown>();
for (let ix = 0; ix < frontierQueue.length; ix++) {
  const node = frontierQueue[ix];
  if (frontierPass.has(node)) continue;
  frontierPass.add(node);
  postCheckNodes.add(node);
  const current = rememberGraphCausal(owner, node);
  if (!current) continue;
  const history = owner.causalHistory!.get(current.node)!;
  let tainted = false;
  for (let version = 0; version < history.length; version++) {
    const frame = history[version]!;
    const compared = WriterDeadline.inspectCausal(node, frame);
    if (frame.unsafe || frame.failed || !compared || !compared.unchanged || compared.unsafe || compared.failed) tainted = true;
    for (let child = 0; child < frame.children.length; child++) frontierQueue[frontierQueue.length] = frame.children[child];
    if (frame.failed) frontierQueue[frontierQueue.length] = frame.failure;
  }
  if (tainted) {
    roots.add(node);
    forced.add(node);
    for (const seed of postCheckFrontier) { roots.add(seed); forced.add(seed); }
  }
}
```

## H-111  src 4516-4523  [packages/engine/src/scribe/graph.ts]  Final graph field and exact rejected-parent literal reconciliation

Anchor: Read-only source-owner reconciliation against snapshot4C8CE7771A081349BDB40AD39FA7285D4988191CB219FB9FDB8F25DF032B54EF found G1–G6 matched, with these finite clarifications. G4 descriptive originalWeakSet means actual field `observedOriginals: new WeakSet<Promise<unknown>>()`, alongside causalHistory/observerFailures/detachedCausalRoots. InvocationCreated aliases SAME actual four fields. G6 exact owner-only nested-parent replacement:

```ts
for (const parent of nested.get(unjoined[index]!)!) {
  forced.add(parent);
  if (postCheckNodes.has(parent)) {
    roots.add(parent);
    for (const seed of postCheckFrontier) { roots.add(seed); forced.add(seed); }
  }
}
```

## H-112  src 4528-4532  [packages/engine/src/scribe/graph.ts]  Final graph field and exact rejected-parent literal reconciliation

Anchor: In owner rejected-drained-Q existing `roots.add(reason); forced.add(reason); forced.add(error);`, append:

```ts
if (postCheckNodes.has(error)) {
  roots.add(error);
  for (const seed of postCheckFrontier) { roots.add(seed); forced.add(seed); }
}
```

## H-113  src 4543-4601  [packages/db/src/decisions.ts]  Final decisions supplemental test replacement — strict-deadline actual native cases

Anchor: Supersedes the S-only testD supplemental draft4261–4304; protected original healthy callback41 remains byte-identical. Append this loop after its old assertions, no new title/helper/file. The final map typing correction is applied literally below (`Record<string, unknown[]>`). Exact frozen N(inserting) physical numeric stage is filled only after measured source freeze, never a family match.

```ts
for (const mode of ["S", "S+C", "S+F", "foreign", "recreated"] as const) {
 const { db: probeDb, fakeDb: probeFake, decisions: rows } = setup();
 const input = {threadId:`d070-native-${mode}`,studentId:"d070-native-student",rejected:[{key:"major",reason:"PRIVATE_D070_OWN_REASON"}]};
 const id=rejectReasonAuditId(input.threadId); const winner={_id:id,kind:"per_fact_reject" as const,threadId:input.threadId,studentId:input.studentId,rejected:[{key:"major",reason:"PRIVATE_D070_WINNER_REASON"}],decidedAt:"2026-10-01",writerToken:"ffffffff-ffff-4fff-8fff-ffffffffffff"};
 if(mode==="foreign")rows.seed(winner);
 const expected:Record<string,unknown[]>=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,probeFake.collection(name).all()]));
 const insert=rows.insertOne.bind(rows),remove=rows.deleteMany.bind(rows);const S=new Error("PRIVATE_D070_SUBSCRIPTION"),C=new Error("PRIVATE_D070_CLEANUP");let reads=0,species=0,stack:string|undefined;let raw:Promise<unknown>|undefined,ownedToken:string|undefined;let once=true,cleanupCalls=0;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let reached!:()=>void;const entered=new Promise<void>(resolve=>{reached=resolve;});let cleanupP:Promise<unknown>|undefined;let publicP:Promise<void>|undefined;let attempt:Promise<{value:unknown}|{error:unknown}>|undefined;
 const hostile={get[Symbol.species](){species++;stack=new Error().stack;throw S;}};
 rows.insertOne=((...args:Parameters<typeof insert>)=>{const P=insert(...args);if(once&&args[0].threadId===input.threadId){once=false;raw=P;ownedToken=args[0].writerToken;Object.defineProperty(P,"constructor",{configurable:true,get(){return ++reads===1?hostile:Promise;}});}return P;}) as typeof rows.insertOne;
 rows.deleteMany=((...args:Parameters<typeof remove>)=>{const filter=args[0] as Record<string,unknown>;if(filter._id===id&&filter.studentId===input.studentId&&filter.writerToken===ownedToken){cleanupCalls++;if(mode==="S+C")return Promise.reject(C);if(mode==="recreated"&&cleanupCalls===1){return(async()=>{await remove({_id:id});rows.seed(winner);expected[COLLECTION_NAMES.decisions]=[winner];return remove(...args);})();}if(mode==="S+F"&&cleanupCalls===1){const P=(async()=>{reached();await held;return remove(...args);})();cleanupP=P;return P;}}return remove(...args);}) as typeof rows.deleteMany;
 try {
  attempt=recordRejectReasons(probeDb,input,{deadlineMs:40}).then(value=>({value}),error=>({error}));
  if(mode==="S+F"){
   await Promise.race([entered,attempt.then(()=>assert.fail("held actual initial undo must be reached"))]);
   const out=await attempt;assert.ok("error"in out&&out.error instanceof FencedWriterDeadlineError);
   if(!("error"in out)||!(out.error instanceof FencedWriterDeadlineError))throw new Error("genuine bounded fault cleanup missing");
   publicP=Object.getOwnPropertyDescriptor(out.error,"settled")!.value;
   let done=false;
   const seen=Promise.prototype.then.call(publicP,()=>{done=true;return{value:undefined};},error=>{done=true;return{error};});
   await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(done,false);assert.ok(cleanupP);
   release();const final=await seen;assert.ok("error"in final);
   if("error"in final){
    const queue:unknown[]=[final.error];const visited=new Set<unknown>();
    for(let i=0;i<queue.length;i++){
     const v=queue[i];if(visited.has(v))continue;visited.add(v);
     if(v instanceof Error){
      const d=Object.getOwnPropertyDescriptor(v,"cause");if(d&&Object.hasOwn(d,"value"))queue.push(d.value);
      if(v instanceof AggregateError){
       const e=Object.getOwnPropertyDescriptor(v,"errors");
       if(e&&Object.hasOwn(e,"value")&&Array.isArray(e.value))for(const key of Reflect.ownKeys(e.value)){
        const member=Object.getOwnPropertyDescriptor(e.value,key);
        if(typeof key==="string"&&/^(0|[1-9]\d*)$/.test(key)&&member&&Object.hasOwn(member,"value"))queue.push(member.value);
       }
      }
     }
    }
    assert.ok(visited.has(S));
   }
  } else {
   const out=await attempt;assert.ok("error"in out);
   if("error"in out){
    if(mode==="S+C"){
     assert.ok(out.error instanceof AggregateError);
     if(out.error instanceof AggregateError){assert.equal(out.error.constructor,AggregateError);assert.equal(out.error.message,"recordRejectReasons: causal observation failed");assert.deepEqual(out.error.errors,[C,S]);}
    } else assert.strictEqual(out.error,S);
   }
  }
  assert.equal(species,1);assert.ok(reads>=2&&raw);
  // Exact frozen N(inserting) numeric stage assertion ONLY after actual source freeze.
  if(mode==="foreign")await assert.rejects(raw!);else await raw;
  if(mode==="S+C"){
   assert.equal(rows.all().filter(row=>row._id===id&&row.writerToken===ownedToken).length,1);assert.ok(cleanupCalls>0);
  }else for(const name of Object.values(COLLECTION_NAMES))assert.deepEqual(BSON.serialize({rows:probeFake.collection(name).all()},{ignoreUndefined:false}),BSON.serialize({rows:expected[name]},{ignoreUndefined:false}));
 }finally{
  release();rows.insertOne=insert;rows.deleteMany=remove;
  await Promise.allSettled([...(raw?[raw]:[]),...(cleanupP?[cleanupP]:[]),...(publicP?[publicP]:[]),...(attempt?[attempt]:[])]);
 }
}
```

## H-114  src 4614-4625  [packages/db/src/facts.ts]  Final summary native/deferred/early supplemental test — complete literal branch

Anchor: From /root/summary_fault_controls. Replace ONLY the existing two matrix loop headers, retain all fourteen original callback bodies below new branch verbatim; remove now-unused second loop closing brace. Same existing callback/title/deadline:

```ts
for (const [window, termination] of [
 ...(["candidate-insert", "summary-cas"] as const).flatMap(window => (["clean-own-expiry", "raw-error", "raw-abort-name", "foreign-clean", "foreign-rejecting", "distinct-cleanup", "shared-cleanup"] as const).map(termination => [window, termination] as const)),
 ["normal-candidate", "observer-only"], ["normal-candidate", "observer-plus-original"],
 ["normal-cas", "observer-only"], ["normal-cas", "observer-plus-original"],
 ["deferredcommit", "observer-only"], ["deferredcommit", "observer-plus-original"],
 ["earlyowned", "observer-only"], ["earlyowned", "observer-plus-original"],
] as const) {
 test("D068 summary original receipt: " + window + " " + termination + " preserves exact failure and owned beforeimage", { timeout: 5_000 }, async t => {
  // New branch below, followed by ALL EXISTING original callback body verbatim.
 });
}
```

## H-115  src 4630-4730  [packages/db/src/facts.ts]  Final summary native/deferred/early supplemental test — complete literal branch

Anchor: Inside that existing callback, BEFORE old setup, insert:

```ts
if (window !== "candidate-insert" && window !== "summary-cas") {
 const { db: rawDb, fakeDb } = setup();
 const db = tenantScopedDb(rawDb, "summary-a"), foreignDb = tenantScopedDb(rawDb, "summary-b");
 const studentId = "receipt-student", sessionId = "receipt-session";
 for (const [scope, text] of [[db, "OWN_COMMITTED_BEFOREIMAGE"], [foreignDb, "FOREIGN_COMMITTED_PERSONAL_HISTORY"]] as const) {
  await scope.collection(COLLECTION_NAMES.consents).insertOne({ _id: "receipt-grant", studentId, guardianConsent: false, minor: false, purposes: ["counselling", "profile_synthesis"], recordedAt: "2026-10-14", lifecycleIncarnation: "11111111-1111-4111-8111-111111111111" });
  await ensureScribeSessionRow(scope, { studentId, sessionId, threadId: "actual-receipt-fixture" });
  await recordApprovedSessionSummary(scope, { studentId, sessionId, summary: text, summaryWithheldReason: "" });
 }
 const before = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, fakeDb.collection<{ _id: string } & Record<string, unknown>>(name).all()]));
 const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions), decisions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.decisions);
 const insert = decisions.insertOne.bind(decisions), cas = sessions.findOneAndUpdate.bind(sessions), update = decisions.updateOne.bind(decisions);
 const S = new Error("PRIVATE_D070_SUMMARY_SUBSCRIPTION"), E = new Error("PRIVATE_D070_SUMMARY_EARLY_CALLBACK");
 let constructorReads = 0, speciesReads = 0, cleanupHits = 0, originalHits = 0; let speciesStack: string | undefined;
 const hostileConstructor = { get [Symbol.species]() { speciesReads++; speciesStack = new Error().stack; throw S; } };
 let latest: Promise<unknown> | undefined, facade: Promise<unknown> | undefined, inner: Promise<unknown> | undefined;
 let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => release = resolve), reached = new Promise<void>(resolve => entered = resolve);
 const originals: Promise<unknown>[] = [], receipts: Array<{ error: unknown; wrappedCause?: unknown }> = [];
 let ownId: unknown, ownToken: unknown, ownedUndo: (() => Promise<void>) | undefined;
 let commit: Parameters<NonNullable<RecordApprovedSessionSummaryOptions["onOwnedWrite"]>>[2];
 let attempt: Promise<{ value: unknown } | { error: unknown }> | undefined; let exposed: FencedWriterDeadlineError | undefined;
 const operationDeadline = new WriterDeadline(80);
 const observer = createHook({ init: (_id, type, _trigger, resource) => { if (type === "PROMISE" && resource instanceof Promise) latest = resource; } });
 const abort = () => { release(); observer.disable(); }; t.signal.addEventListener("abort", abort, { once: true });
 try {
  decisions.insertOne = ((...args) => {
   if (args[0].kind === "session_summary_write" && args[0].tenantId === "summary-a" && (args[0].payload as Record<string, unknown> | undefined)?.summary === "FAILED_D070_PERSONAL_SUMMARY") {
    ownId = args[0]._id; ownToken = args[0].writerToken;
    if (window === "normal-candidate" && originalHits++ === 0) {
     facade = latest; assert.ok(facade); observer.disable(); Object.defineProperty(facade, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } });
     inner = (async () => { entered(); await held; return insert(...args); })(); return inner;
    }
   }
   return insert(...args);
  }) as typeof decisions.insertOne;
  sessions.findOneAndUpdate = ((...args) => {
   if (window === "normal-cas" && args[0]._id === "summary-a:receipt-session" && args[1].$set?.summary === "FAILED_D070_PERSONAL_SUMMARY" && originalHits++ === 0) {
    facade = latest; assert.ok(facade); observer.disable(); Object.defineProperty(facade, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } });
    inner = (async () => { entered(); await held; const result = await cas(...args); assert.ok(result); return result; })(); return inner;
   }
   return cas(...args);
  }) as typeof sessions.findOneAndUpdate;
  decisions.updateOne = ((...args) => {
   if (args[0]._id === ownId && args[0].writerToken === ownToken && args[0].tenantId === "summary-a" && args[1].$set?.state === "invalid") cleanupHits++;
   if (window === "deferredcommit" && args[0]._id === ownId && args[0].writerToken === ownToken && args[1].$set?.state === "committed" && originalHits++ === 0) {
    facade = latest; assert.ok(facade); observer.disable(); Object.defineProperty(facade, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } });
    inner = (async () => { entered(); await held; return update(...args); })(); return inner;
   }
   return update(...args);
  }) as typeof decisions.updateOne;
  const options: RecordApprovedSessionSummaryOptions = { deadlineMs: 80,
   onOriginalOperation: raw => { originals.push(raw); }, onExpectedExpiry: (error, provenance) => { receipts.push({ error, wrappedCause: provenance?.wrappedCause }); },
   onOwnedWrite: (undo, _work, commitOwned) => { ownedUndo = undo; commit = commitOwned; if (window === "earlyowned") throw E; },
   ...(window === "deferredcommit" ? { deferSummaryCommit: true as const } : {}),
  };
  if (window === "earlyowned") {
   let first = true;
   options.authorize = () => {
    const P = (async () => { if (first) { entered(); await held; } const grant = await db.collection(COLLECTION_NAMES.consents).findOne({ studentId }); assert.ok(grant); assert.equal(grant._id, "receipt-grant"); assert.equal(grant.lifecycleIncarnation, "11111111-1111-4111-8111-111111111111"); assert.ok(grant.purposes.includes("profile_synthesis")); })();
    if (first) { first = false; facade = P; inner = P; observer.disable(); Object.defineProperty(P, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } }); }
    return P;
   };
  }
  observer.enable();
  const summaryAttempt = recordApprovedSessionSummary(db, { studentId, sessionId, summary: "FAILED_D070_PERSONAL_SUMMARY" }, options);
  if (window === "deferredcommit") {
   const result = await summaryAttempt; assert.equal(decisions.all().find(row => row._id === result.summaryLineageId)?.state, "pending"); assert.ok(commit); observer.enable();
   attempt = commit({ authorize: async () => { const grant = await db.collection(COLLECTION_NAMES.consents).findOne({ studentId }); assert.ok(grant); assert.equal(grant.lifecycleIncarnation, "11111111-1111-4111-8111-111111111111"); }, deadline: operationDeadline, onOriginalOperation: raw => { originals.push(raw); } }).then(value => ({ value }), error => ({ error }));
  } else attempt = summaryAttempt.then(value => ({ value }), error => ({ error }));
  const gate = await Promise.race([reached.then(() => "reached"), attempt.then(() => "terminal")]); assert.equal(gate, "reached"); assert.equal(speciesReads, 1); assert.ok(facade && inner); assert.equal(originals.filter(raw => raw === facade).length, 1);
  assert.equal(cleanupHits, 0);
  if (termination === "observer-only") release();
  const outcome = await attempt; assert.ok("error" in outcome);
  let failure: unknown = outcome.error;
  if (termination === "observer-plus-original") {
   assert.ok(failure instanceof FencedWriterDeadlineError); exposed = failure;
   let terminal = false; void exposed.settled.then(() => { terminal = true; }, () => { terminal = true; }); await Promise.resolve(); assert.equal(terminal, false);
   assert.equal(cleanupHits, 0); release(); await inner.catch(() => undefined);
   try { await exposed.settled; assert.fail("native observer S must reject owned settlement"); } catch (error) { failure = error; }
  }
  assert.ok(failure instanceof AggregateError); assert.equal(failure.constructor, AggregateError);
  assert.equal(failure.message, termination === "observer-only" ? "Session summary failure and owned cleanup failed." : "recordApprovedSessionSummary: owned writer settlement failed");
  if (termination === "observer-only") assert.deepEqual(failure.errors, window === "earlyowned" ? [E, S] : [S]);
  const seen = new Set<unknown>(), stack: unknown[] = [failure, outcome.error];
  while (stack.length) { const node = stack.pop(); if (seen.has(node)) continue; seen.add(node); if (node instanceof Error) { const cause = Object.getOwnPropertyDescriptor(node, "cause"); if (cause && "value" in cause) stack.push(cause.value); } if (node instanceof AggregateError && node.constructor === AggregateError) { const members = Object.getOwnPropertyDescriptor(node, "errors"); if (members && "value" in members && Array.isArray(members.value)) stack.push(...members.value); } }
  assert.ok(seen.has(S)); if (window === "earlyowned") assert.ok(seen.has(E)); assert.equal(Object.hasOwn(S, "cause"), false);
  for (const rendered of [failure.message, String(failure), JSON.stringify(failure)]) assert.equal(rendered.includes("PRIVATE_"), false);
  const expectedCleanupHits = window === "earlyowned" && termination === "observer-plus-original" ? 0 : 1;
  assert.equal(cleanupHits, expectedCleanupHits); assert.ok(ownedUndo); await ownedUndo().catch(() => undefined); await ownedUndo().catch(() => undefined); assert.equal(cleanupHits, expectedCleanupHits);
  for (const name of Object.values(COLLECTION_NAMES)) {
   const rows = fakeDb.collection<{ _id: string } & Record<string, unknown>>(name).all();
   assert.deepEqual(BSON.serialize({ rows: rows.filter(row => row.tenantId === "summary-b") }), BSON.serialize({ rows: before[name]!.filter(row => row.tenantId === "summary-b") }));
   assert.deepEqual(BSON.serialize({ rows: rows.filter(row => !(name === COLLECTION_NAMES.decisions && row._id === ownId)) }), BSON.serialize({ rows: before[name] }));
  }
  if (ownId !== undefined) { const candidate = decisions.all().find(row => row._id === ownId)!; assert.equal(candidate.state, "invalid"); assert.equal(Object.hasOwn(candidate, "payload"), false); }
  assert.equal(receipts.some(receipt => receipt.error === S || receipt.error === E), false);
  // Exact speciesStack physical source stage qualified only after implementation freeze.
 } finally { release(); observer.disable(); t.signal.removeEventListener("abort", abort); decisions.insertOne = insert; sessions.findOneAndUpdate = cas; decisions.updateOne = update; operationDeadline.dispose(); await inner?.catch(() => undefined); await attempt; await exposed?.settled.catch(() => undefined); await Promise.allSettled(originals); }
 return;
}
```


## H-116  src 4241-4248  [packages/engine/src/scribe/graph.ts]  Amendment G4 (prose-only in source; verbatim)


Source9AC. At authorizeSnapshot125 add final private `causalContext?: GraphCausalContext`; after owner129 bind `const causal = owner ?? causalContext`; catch175 begins `if (causal) rememberGraphCausal(causal, error);`. Private GraphDeps.authorize557 adds optional fifth causalContext; lambda512 forwards it to authorizeSnapshot. Ownerless deps.authorize2240/2271/2368 pass invocationCreated fifth;2524 passes created;2684/2699 pass inspection-local causal. Existing688/696 use owner ALS. No public export/receipt/query/authority grant.

fencedForPostCheck740 gains final private `causalContext: GraphCausalContext`; sole call1023 supplies owner. Anonymous744 becomes `catch (error) { rememberGraphCausal(causalContext, error); return true; }`, preserving fail-safe true and same P/deadline.

At outer resumeScribe beside deadline2005 mint one private context with causalHistory/originalWeakSet/observerFailures/detachedCausalRoots; sole2007call passes it as last argument. Private resumeUnderDeadline2025 gains final causal:GraphCausalContext; invocationCreated2029 aliases the SAME four references, not a second ledger. Before outer2009 deadline.op call the gate(causal). Outer2010 first remember(causal,err), then before2011 conversion collect actual err plus actual faults with captured graphSame identity dedup; if ledger nonempty throw sole actual identity or AggregateError(array,"Scribe native observation failed."). No faults preserves exact old SessionRowMissing conversion/throw. Inner collector already owns compensation; private context is negative-only, not extra ownership. Undefined is retained. This supersedes the earlier G3part2 statement that no outer context was proposed: this finite private threading supplies it without a public/context-global API.


## H-117  src 4249-4260  [packages/engine/src/scribe/graph.ts]  Amendment G5 (prose-only in source; verbatim)


Source coordinates, not prospective doc callsite repins. Every listed catch inserts rememberGraphCausal(SAMEctx, actual binding) FIRST, before guard/await/collector:

- owner `error`:175(optional causal alias under G4),680,812,846,909,982,1034; `expiry`:681outer/815/849; `err`:859/1015/1026/1105/1571/1767/1818/1915; `cleanupErr`:1049/1064/1108; `cleanupFailure`:1112.
- createdCall `err`:1217/1342 (1342 BEFORE owner earlythrow); `error`:1229/1354; `cleanupFailure`:1289; `failure`:1414.
- created `err`:1591; `error`:1623/1699; `cleanupFailure`:1755/1902; `cleanupErr`:1781.
- invocationCreated `err`:2153/2306/2394 (2394 BEFORE owner earlythrow); `error`:2186/2204/2335/2353/2410; `failure`:2492.
- inspect local causal `err`:2621/2644/2721/2744 (2744 BEFORE collector IIFE).

Existing deadline.op catch(error) wrappers first remember using SAME existing receipt context, then original receipt callback/throw. Existing rejection callbacks1573error use owner before compensate;2210/2359error invocationCreated before throw; allSettled outcomes2190/2339 invocationCreated before postFailure. Original-expiry callbacks789/1146/2041 first remember SAME owner/createdCall/invocationCreated before original receipt. Three receipt arrows778/1136/2031 first remember before provenance/registry. G4 supplies anonymous744 and outer2010. Source1915 gets capture ONLY, never the fault gate in its unconditional expiry catch. Ordinary catch roots receive no positive receipt enrollment.


## H-118  src 3995-4026,4182-4187  [graph.ts]  Amendment G3 part1 prose + part2 gate map (verbatim)


Capture `const graphSetEach = Set.prototype.forEach;` beside inert intrinsics; one unique private helper in the existing graph module beside metadata adapters:

```

Undefined is an actual fault (length discriminates). No receipt callback, onExpectedExpiry, synthetic FWD or new deadline. Existing failure collectors union the entire observer ledger into roots+forced, retaining coexisting R separately. Normal exits call this gate inside their existing try/cleanup path, not outside it.

Owner catch1015 begins rememberGraphCausal(owner,err), preserving original thrown R. After authorization catch1026 closes, before existing settled1032:

```

Healthy-work S sets thrown and reaches existing ordinary-failure branch1062 `compensate(true, thrown)` under SAME deadline. Coexisting R stays original thrown R; ledger S independently roots+forced in compensate. Metadata S does not mark authorityLost. In existing finalcommit try, after authorize1104, call the gate before op; existing1105catch performs compensation. Leased healthy invoke has no await from this gate to1121 return (claimAuthority skips finalcommit).

UnderLease1590 append gate(created) immediately after `result = await work()` inside existing1591catch; at1815 after final `await owner.authorize()` and before op inside existing1818 cleanup-catching try. Owned invoke failure compensates before lease retry-release. Ownerless failure uses existing1684 collector. Do not inject the gate into unconditional expiry synthesis1915catch; no awaited interval follows1815 gate before successful result.

Start early fenced returns1148/1153/1158 become `{ throwGraphObserverFaults(createdCall); return { kind: "fenced" }; }`. At1162 refusal/1163 crisis/1297 history-hold/1339 fenced/1341 outcome, prepend the same gate inside outer1134try. Conditional-return branches use braces so the gate runs only when actually returning. At1336 inner invoke callback after readOutcome, gate(createdCall) before returning; S becomes actual work rejection and follows existing owned compensation. Outer1342 capture must precede owner early rethrow. Resume/inspect normal exits and complete catch map remain outstanding, so G3 alone is not complete authority.


Resume invocationCreated exits2045/2099fenced,2106hold,2215in_progress AFTERcurrentAuthority,2236fenced,2249alreadyResolved,2255hold,2376alreadyResolved gate only the chosen conditional return. Await-return2102/2114recover,2218underLease,2393run/underLease replace `return await EXACTCALL;` with `{ const result = await EXACTCALL; throwGraphObserverFaults(invocationCreated); return result; }` in SAME outertry, SAME call/deadline, no extra async P. recoverUnder created2555fenced/2557outcome gates before chosen return; internal2542/2553 covered by owner.

Inspect local causal gates2608notfound/2628fenced/2651fenced/2653done/2662notfound/2728fenced/2738candidate INSIDE existing read IIFE and2743result after deadline.op inside outertry. Actual faults route through2744 collector. readOutcome685/691/699 and internal1007/1336/2387 are covered by enclosing owner's post1026 gate. The earlier optional inner1336 gate in G3part1 is WITHDRAWN as redundant; do not implement it. Outer resume2009/2011 lacks invocation context: do not invent public context or change SessionRowMissing hold rule. Inner2394 coexisting-fault routing and private ownerless authorization/postcheck context plumbing remain required before whole packet can be complete.

