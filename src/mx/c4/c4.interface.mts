import { MxCell } from '../MxCell.interface.mjs';

export interface c4 {
    $: {
        c4Name: string;
        c4Type?: string;
        /** Matched element-tag stereotype prefix rendered just before
         *  `«c4Type»` (e.g. `critical»«` → `«critical»«System»`).
         *  Empty string when the element carries no `$tags` that match
         *  an `AddElementTag` — keeps untagged output byte-identical. */
        c4Stereotype?: string;
        c4Technology?: string;
        c4Description?: string;
        label?: string;
        placeholders?: number;
        type?: string;
        factSheetType?: string;
        factSheetId?: string;
        id?: string;
        /** $link= on a C4 element → clickable drawio link on the object. */
        link?: string;
    };
    MxCell: MxCell;
}
