# Reliability follow-up

Addresses the remaining PDF reports R3 (draft loss, Manage loop and correction visibility), R4 (page scrolling over charts), and supporting M1/W2 interaction paths.

- Ordinary wheel scrolling now belongs to the page over both timeline and market-price chart views. The timeline accepts Alt + wheel for deliberate zoom; zoom buttons, keyboard controls, dragging and touch gestures remain available. The market view retains axis scaling and touch zoom.
- Persistent forms retain unchecked checkbox/radio groups and empty or multiple selections. Open editors scroll to their first field rather than aligning the bottom of an expanded form; hidden supporting forms do not take focus.
- Playbook draft restoration validates draft shape separately from committed-record rules. Missing time-window endpoints and incomplete numeric inputs no longer discard the complete draft. Final saves retain the existing domain validation. Successful saves display a confirmation.
- The Missions page opens its builder directly rather than linking to the same page. Mission form drafts survive leaving and reopening the builder, and clear after successful save.
- Check-in correction waits until draft restoration has finished before scrolling and focusing its heading.

Regression coverage exercises the concrete failures above. These changes do not establish that every historical PDF report has been reproduced, or complete the optional learning centre, export prototype, hardware validation or exploration items.
