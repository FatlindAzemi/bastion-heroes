/**
 * Root UI component. The boot screen shows the game title over the 3D title scene;
 * the screen state machine arrives in M4 (spec 11.8).
 */
export function App() {
  return (
    <main class="boot-screen">
      <div class="boot-screen__vignette" aria-hidden="true" />
      <header class="boot-screen__lockup">
        <h1 class="boot-screen__title">Bastion Heroes</h1>
      </header>
    </main>
  );
}
