/**
 * STAGE_WRAPPER_CLASSNAME — the canonical outer wrapper className for
 * every pipeline stage page (Ventures list, Strategy / Play detail,
 * Discover, Prospects, Leads, Conversations).
 *
 * @stage-wrapper-canonical  ← grep this token to find the source of truth.
 *
 * ─── DO NOT inline these values back into the stage clients ───
 *
 * Before this file existed, the same className lived in six places and
 * drifted every time someone tweaked clearspace. Centralising it means
 * the rule lives in one spot, history is annotated below, and anyone
 * (human or agent) who wants to change ribbon spacing has to do it
 * here and accept that all six pages move in lockstep.
 *
 * ─── The values, and why they are what they are ───
 *
 *   pt-[12px]   INTENTIONAL TIGHT TOP. The FunnelRibbon's lozenge sits
 *               12px below the top of the page on every stage. Bumping
 *               this to 52px to match the lozenge height makes the
 *               ribbon read as too low / too far down the page —
 *               confirmed by Craig multiple times. Do NOT "fix" this
 *               by symmetry-matching it to gap-[52px] / pb-[52px].
 *
 *   gap-[52px]  Vertical gap between the FunnelRibbon (first child)
 *               and the content panel below it (second child). Equal
 *               to one lozenge height of clear space.
 *
 *   pb-[52px]   Bottom page padding equal to the ribbon clearspace,
 *               so the page rhythm closes symmetrically at the bottom.
 *
 *   px-6        Horizontal page gutters; matches the /ventures hero
 *               and the AppSidebar inset.
 *
 * ─── History ───
 *
 *   #152  Set pt / gap / pb all to 52px ("symmetric clearspace").
 *   #154  Dropped pt to 12px at user request — "ribbon was sitting
 *         too low down on the page".
 *   #162  Bumped pt back to 52px in error (mis-read user complaint
 *         about the ribbon "snapping back" — they actually meant
 *         something else). Reverted in #163.
 *   #163  Restored pt-[12px] AND extracted the className into this
 *         constant so it can't drift across files again. If you
 *         want to change the ribbon clearspace, do it here.
 */
export const STAGE_WRAPPER_CLASSNAME =
  'flex flex-col gap-[52px] px-6 pt-[12px] pb-[52px]';

/**
 * Same as STAGE_WRAPPER_CLASSNAME but clamps to the viewport height and
 * paints the dark page background. Used by stage pages whose content
 * scrolls inside the wrapper rather than at the document level
 * (Discover, Prospects, Leads).
 *
 * @stage-wrapper-canonical
 */
export const STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT =
  STAGE_WRAPPER_CLASSNAME + ' h-[calc(100vh-56px)] bg-evari-ink';

/**
 * Same as STAGE_WRAPPER_CLASSNAME but fills the parent's remaining
 * flex column (used by Conversations, which is wrapped by a parent
 * flex layout that already sets its own height).
 *
 * @stage-wrapper-canonical
 */
export const STAGE_WRAPPER_CLASSNAME_FILL =
  STAGE_WRAPPER_CLASSNAME + ' flex-1 min-h-0 overflow-hidden bg-evari-ink';
