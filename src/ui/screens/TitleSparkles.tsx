/** Floating ember / firefly dots of the cinematic title screen (issue #114). */
import type { CSSProperties } from 'preact/compat';

/** One decorative dot: position, size, colour and drift timing. */
interface SparkleSpec {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly delay: number;
  readonly duration: number;
  readonly tone: 'gold' | 'teal' | 'violet';
}

const SPARKLES: readonly SparkleSpec[] = [
  { x: 12, y: 64, size: 5, delay: 0, duration: 7.5, tone: 'teal' },
  { x: 24, y: 38, size: 3, delay: 1.4, duration: 6.2, tone: 'gold' },
  { x: 78, y: 56, size: 6, delay: 0.7, duration: 8.4, tone: 'gold' },
  { x: 88, y: 30, size: 4, delay: 2.2, duration: 7.1, tone: 'teal' },
  { x: 62, y: 20, size: 3, delay: 1.1, duration: 6.8, tone: 'violet' },
  { x: 38, y: 76, size: 4, delay: 2.8, duration: 9.1, tone: 'violet' },
  { x: 52, y: 48, size: 3, delay: 0.4, duration: 7.8, tone: 'gold' },
  { x: 18, y: 48, size: 3, delay: 3.4, duration: 8.2, tone: 'teal' },
];

/** Renders the twinkling, slowly drifting embers behind the logo lockup. */
export function TitleSparkles() {
  return (
    <div class="title-sparkles" aria-hidden="true">
      {SPARKLES.map((sparkle, index) => {
        const style = {
          left: `${sparkle.x}%`,
          top: `${sparkle.y}%`,
          '--sparkle-size': `${sparkle.size}px`,
          '--sparkle-delay': `${sparkle.delay}s`,
          '--sparkle-duration': `${sparkle.duration}s`,
        } as CSSProperties;
        return (
          <span key={index} class={`title-sparkle title-sparkle--${sparkle.tone}`} style={style} />
        );
      })}
    </div>
  );
}
