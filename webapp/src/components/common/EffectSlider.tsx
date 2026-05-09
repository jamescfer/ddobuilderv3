// Reusable slider for Effect_CreateSlider declarations.
// Reads/writes build.sliderValues via the Character context.

import { useCharacter } from '../../context/CharacterContext'
import type { SliderDef } from '../../lib/effects/sliders'
import styles from './EffectSlider.module.css'

interface EffectSliderProps {
  def: SliderDef
  /** When false, the slider renders disabled (e.g. parent stance not active). */
  active?: boolean
}

export default function EffectSlider({ def, active = true }: EffectSliderProps) {
  const { build, dispatch } = useCharacter()
  const current = build.sliderValues[def.name] ?? def.initial

  return (
    <div className={`${styles.row} ${active ? '' : styles.disabled}`}>
      <label className={styles.label} title={`source: ${def.source}`}>
        {def.name}
      </label>
      <input
        className={styles.range}
        type="range"
        min={def.min}
        max={def.max}
        step={1}
        value={current}
        disabled={!active}
        onChange={(e) =>
          dispatch({ type: 'SET_SLIDER', name: def.name, value: Number(e.target.value) })
        }
      />
      <span className={styles.value}>{current}</span>
    </div>
  )
}
