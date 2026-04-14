import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: ["extension/**", "node_modules/**", ".next/**", "coverage/**", "public/**"],
  },
];

export default eslintConfig;
