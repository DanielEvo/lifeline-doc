import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { addFeedback, listFeedback } from "../store.server";

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rating: z.string().min(1).max(40),
      note: z.string().max(1000).default(""),
      step: z.string().max(40).default(""),
    }),
  )
  .handler(async ({ data }) => addFeedback(data));

export const getFeedback = createServerFn({ method: "GET" }).handler(async () =>
  listFeedback(),
);
