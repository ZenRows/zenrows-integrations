import { z } from "zod";
import { zFetchParams } from "../../../schema/common.ts";

/**
 * `zenrows#extract` query parameters: the shared Fetch mirror plus the
 * field selector. `extract` itself is NOT mirrored: the endpoint pins
 * `extract=auto` at its binding, because a caller cannot choose another
 * extraction strategy here.
 */
export const zExtractQueryParams = zFetchParams.extend({
    extract_fields: z.string().describe(
        "A comma-separated list of the field names to return, " +
            "dot-notated for a field inside a group, for example " +
            "'products.name,products.price'. Omit it to receive every " +
            "field Zenrows parsed.",
    ).optional(),
});
