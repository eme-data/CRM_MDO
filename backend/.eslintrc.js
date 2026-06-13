// Config ESLint backend (advisory en CI : ne bloque pas le pipeline, le build
// reste la barriere dure). Objectif : attraper les vraies erreurs (variables/
// imports inutilises, code mort, switch sans break) sans noyer la base NestJS
// existante sous des warnings de style. On reste volontairement SANS regles
// type-aware (pas de parserOptions.project) pour un lint rapide et robuste.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, jest: true },
  ignorePatterns: ['dist', 'node_modules', 'prisma', 'test', '*.js'],
  rules: {
    // Vrais signaux :
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    // while(true)/for(;;) de pagination sont idiomatiques -> on n'alerte que sur
    // les vraies conditions constantes hors boucle, en warning.
    'no-constant-condition': ['warn', { checkLoops: false }],
    'no-regex-spaces': 'warn',
    // Bruit tolere dans cette base (NestJS + DTO dynamiques) :
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    'no-useless-escape': 'warn',
  },
};
