/** Props of the red rejection message under the card bar (spec 3.4). */
export interface RejectionMessageProps {
  readonly message: string | null;
}

/** Shows why the last command was rejected, e.g. "Not enough Essence" (spec 3.4). */
export function RejectionMessage({ message }: RejectionMessageProps) {
  if (message === null) {
    return null;
  }
  return (
    <div class="hud-rejection" role="status">
      <span class="hud-rejection__text hud-outlined-text">{message}</span>
    </div>
  );
}
