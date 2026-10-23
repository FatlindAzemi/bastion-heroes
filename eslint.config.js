// ESLint flat config (spec 10.2 and 10.3). Import boundaries follow spec 10.4.
import tseslint from 'typescript-eslint';

// Generated or local-only folders: never lint them. Mirrored in .prettierignore and .gitignore.
const ignores = [
  '.worktrees/',
  'dist/',
  'node_modules/',
  'test-results/',
  'playwright-report/',
  'blob-report/',
  'coverage/',
  'assets-build/',
  'balance-report/',
];

// Spec 10.4: the platform layer is the only folder allowed to import these packages.
const platformOnlyPackages = {
  regex:
    '^(?:howler|posthog-js|@capacitor(?:-community)?(?:/|$)|@supabase(?:/|$)|@revenuecat(?:/|$))',
  message:
    'Only src/platform/ may import Capacitor, Supabase, RevenueCat, AdMob, PostHog or Howler (spec 10.4).',
};

// Spec 10.4: the sim layer must stay headless. No DOM and no wall-clock randomness.
const domGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'HTMLImageElement',
  'Image',
  'Audio',
].map((name) => ({ name, message: 'src/sim/ must not use DOM APIs (spec 10.4).' }));

const nondeterministicGlobals = [
  {
    object: 'Math',
    property: 'random',
    message: 'The sim must be deterministic (spec 3.2, 10.4).',
  },
  { object: 'Date', property: 'now', message: 'The sim must be deterministic (spec 3.2, 10.4).' },
  {
    object: 'performance',
    property: 'now',
    message: 'The sim must be deterministic (spec 3.2, 10.4).',
  },
];

/**
 * Forbids relative imports that climb out of a layer into one of the given
 * sibling folders, e.g. "../../render/x" from a file in src/sim/combat/ (spec 10.4).
 */
function escapesTo(layers, message) {
  return { regex: `^(?:\\.\\./)+(?:${layers.join('|')})(?:/|$)`, message };
}

/**
 * Forbids every package import except the ones matched by allowRegex, and every
 * absolute import. Relative imports ("./x", "../x") are not matched (spec 10.4).
 */
function packagesExcept(allowRegex, message) {
  return { regex: allowRegex ? `^(?!(?:${allowRegex}))(?:[^./]|/)` : '^(?:[^./]|/)', message };
}

/** Forbids exactly the package imports matched by regex (spec 10.4). */
function packagesMatching(regex, message) {
  return { regex, message };
}

export default tseslint.config(
  { ignores },
  tseslint.configs.recommended,
  {
    rules: {
      // Spec 10.2: no `any`. Kept explicit so a future preset change cannot weaken it.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Spec 10.4: src/sim/ may import only from src/sim/ and src/data/.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            platformOnlyPackages,
            packagesExcept(
              null,
              'src/sim/ may import only from src/sim/ and src/data/ (spec 10.4).',
            ),
            escapesTo(
              ['render', 'ui', 'meta', 'platform', 'main', 'loop'],
              'src/sim/ may import only from src/sim/ and src/data/ (spec 10.4).',
            ),
          ],
        },
      ],
      'no-restricted-globals': ['error', ...domGlobals],
      'no-restricted-properties': ['error', ...nondeterministicGlobals],
    },
  },
  {
    // Spec 10.4: src/data/ may import only zod and other files in src/data/.
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            platformOnlyPackages,
            packagesExcept(
              'zod(?:/|$)',
              'src/data/ may import only zod and other files in src/data/ (spec 10.4).',
            ),
            escapesTo(
              ['sim', 'render', 'ui', 'meta', 'platform', 'main', 'loop'],
              'src/data/ may import only zod and other files in src/data/ (spec 10.4).',
            ),
          ],
        },
      ],
    },
  },
  {
    // Spec 10.4: src/render/ may import from src/sim/, src/data/, three, three.quarks and gsap.
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            platformOnlyPackages,
            packagesExcept(
              'three(?:\\.quarks)?(?:/|$)|gsap(?:/|$)',
              'src/render/ may import only from src/sim/, src/data/, three, three.quarks and gsap (spec 10.4).',
            ),
            escapesTo(
              ['ui', 'meta', 'platform', 'main', 'loop'],
              'src/render/ may import only from src/sim/, src/data/, three, three.quarks and gsap (spec 10.4).',
            ),
          ],
        },
      ],
    },
  },
  {
    // Spec 10.4: src/ui/ may import from src/meta/, src/data/, src/platform/, preact and gsap. Never three.
    files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            platformOnlyPackages,
            packagesExcept(
              'preact(?:/|$)|@preact/signals(?:/|$)|gsap(?:/|$)',
              'src/ui/ may import only from src/meta/, src/data/, src/platform/, preact and gsap; it never imports three (spec 10.4).',
            ),
            escapesTo(
              ['sim', 'render', 'main', 'loop'],
              'src/ui/ may import only from src/meta/, src/data/, src/platform/, preact and gsap; it never imports three (spec 10.4).',
            ),
          ],
        },
      ],
    },
  },
  {
    // Spec 10.4: src/meta/ may import from src/data/ and src/platform/ only.
    files: ['src/meta/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            platformOnlyPackages,
            packagesExcept(
              null,
              'src/meta/ may import only from src/data/ and src/platform/ (spec 10.4).',
            ),
            escapesTo(
              ['sim', 'render', 'ui', 'main', 'loop'],
              'src/meta/ may import only from src/data/ and src/platform/ (spec 10.4).',
            ),
          ],
        },
      ],
    },
  },
  {
    // Spec 10.4: src/platform/ is the only folder that imports the native/backend packages.
    // It is the lowest layer (spec 11.1) and must not import the layers above it.
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            packagesMatching(
              '^(?:three(?:\\.quarks)?(?:/|$)|preact(?:/|$)|@preact/signals(?:/|$)|gsap(?:/|$))',
              'src/platform/ must not import three, three.quarks, preact or gsap: they belong to src/render/ and src/ui/ (spec 10.2).',
            ),
            escapesTo(
              ['sim', 'render', 'ui', 'meta', 'main', 'loop'],
              'src/platform/ is the lowest layer and must not import src/sim/, src/render/, src/ui/ or src/meta/ (spec 10.4, 11.1).',
            ),
          ],
        },
      ],
    },
  },
);
