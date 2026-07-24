---
"langtell": patch
---

Count `LanguageProfile.marks` only between two letters, so quotation marks in Russian prose (`Фильм 'Брат' вышел`) no longer short-circuit rung 1 into a pinned `uk` verdict; distinctiveness stays candidate-relative, so a mark two candidates carry still cancels.

Require an alphabetic TLD (and drop the `i` flag) in the bare-domain noise pattern, so a missing space after a period (`The end.The next one`), an abbreviation (`e.g. this`) or a decimal (`Version 1.2`) is no longer deleted before the script vote and the rung tallies.

Enforce `RUNG3_MIN_LENGTH` at the rung-3 call site — an injected resolver is never asked about text below the trigram floor — and have `langtell/franc` import that same constant instead of redeclaring its own copy.
