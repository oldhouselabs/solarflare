import { ZodError } from "zod";
import { ErrorMessageOptions, generateErrorMessage } from "zod-error";

const OPTIONS = {
  code: {
    enabled: false,
  },
  path: {
    type: "breadcrumbs",
    enabled: true,
    label: "",
  },
  delimiter: {
    component: ": ",
  },
  message: {
    enabled: true,
    label: "",
    transform: (c) => c.value.toLocaleLowerCase(),
  },
} satisfies ErrorMessageOptions;

export const format = (error: ZodError, prefix?: string) => {
  return generateErrorMessage(error.issues, {
    prefix: prefix && `${prefix} `,
    ...OPTIONS,
  });
};
