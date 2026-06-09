# V2 Golden Values

This directory stores `.golden.json` files — pre-captured V2 breakdown values for
specific `.DDOBuild` fixtures. They are used by `scripts/v2GoldenCompare.ts` to
diff V3's computed stats against V2's actual output.

## How to add a golden file

1. **Generate a template** from V3's current output:

   ```sh
   cd webapp
   npx tsx scripts/v2GoldenCompare.ts ../Output/Example\ Builds/YingsMonk.DDOBuild --capture
   # → writes YingsMonk.golden.json next to the .DDOBuild file
   ```

2. **Open the same `.DDOBuild` in V2** (Windows). Navigate to each BreakdownsPane
   tab (HP, AC, Saves, PRR/MRR, Skills, SP, Caster Level, DC, etc.) and note the
   **Total** values shown.

3. **Edit the `.golden.json`** file:
   - Replace V3 values with the actual V2 totals.
   - Set `"capturedAt"` to today's date.
   - Move the file to this `golden/` directory.

4. **Run the diff** to verify V3 matches V2:

   ```sh
   npx tsx scripts/v2GoldenCompare.ts ../Output/Example\ Builds/YingsMonk.DDOBuild \
     scripts/golden/YingsMonk.golden.json
   ```

## Tolerance guidelines

- Most integer stats (HP, PRR, AC, saves): `"defaultTolerance": 1` is safe for
  rounding and minor display differences.
- Floating-point stats (dodge %): use `{ "expected": 12.5, "tolerance": 0.5 }`.
- Stats where V2 and V3 are known to differ intentionally (e.g. V3's simplified
  combat estimator): omit from the golden file entirely.

## Stat key reference

Golden file keys match `BuildStats.keys()` output. Common ones:

| Key                   | V2 BreakdownsPane location          |
|-----------------------|--------------------------------------|
| `hp`                  | Hit Points → Total                   |
| `ac`                  | AC → Total                           |
| `prr`                 | Physical Resistance Rating → Total   |
| `mrr`                 | Magical Resistance Rating → Total    |
| `dodge`               | Dodge → Total                        |
| `save.Fort`           | Saves → Fortitude Total              |
| `save.Reflex`         | Saves → Reflex Total                 |
| `save.Will`           | Saves → Will Total                   |
| `bab`                 | Base Attack Bonus → Total            |
| `sp`                  | Spell Points → Total                 |
| `dc.Necromancy`       | Spell DCs → Necromancy               |
| `cl.Wizard`           | Caster Level → Wizard                |
| `skill.Balance`       | Skills → Balance Total               |
