import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['reicon-react', 'reicon-react/*'], message: 'Import icons from @/components/icons' },
            {
              group: ['lucide-react', 'react-icons', 'react-icons/*', '@heroicons/*', '@mui/*', 'antd'],
              message: 'Only Cloudscape and Reicon are allowed',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='iconName']", message: 'Use iconSvg with svg() from @/components/icons' },
        { selector: "JSXAttribute[name.name='iconUrl']", message: 'Use iconSvg with svg() from @/components/icons' },
        { selector: "JSXOpeningElement[name.name='svg']", message: 'Add the icon to @/components/icons instead' },
      ],
    },
  },
  {
    files: ['src/components/icons.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
