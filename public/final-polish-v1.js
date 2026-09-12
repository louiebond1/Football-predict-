/* Route-hold/skeleton logic removed: same-tab-scroll.js's mask system already
   covers every tab transition (Live gets the cinematic hero mask, everything
   else gets the flat exit mask), theme-aware and race-hardened. This file
   used to run a second, uncoordinated overlay system reacting to the same
   nav clicks and DOM mutations - two independent full-screen covers with
   different content and different removal timing stacking on top of each
   other, which is what produced a visible bounce/flash on every transition. */
