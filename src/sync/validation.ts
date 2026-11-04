import {
	TFile
} from 'obsidian';

export type ProjectIn = {// in
    title: string;
    id: string;
    notes: string;
};

type ProjectOut = {// out create
    title: string;
    area?: string// depends on the note
    notes: string;
}|{// out update
    title: string;
    area?: string// depends on the note
    id: string;
};

type TodoOut = {// out
    title: string;
    status: 'Open' | 'Completed' | 'Canceled';
    hid?: string;
    checklist?: string;
};
export type TodoIn = {// in
    title: string;
    id: string;
    status: 'Open' | 'Completed' | 'Canceled';
    hid: string;
    checklist: string;
};
// update
type UpdateTodo = {
    type: 'to-do'
    operation: 'update';
    id: string;
    attributes: {
        title: string;
        completed: boolean;
        canceled: boolean;
        'heading-id'?: string;
        'checklist-items': Array<{
            type: 'checklist-item';
            attributes: {
                title: string;
                completed: boolean;
                canceled: boolean;
            }
        }>;
    }
};
export type OutData = {// out
    p: ProjectOut;
    h: string[];
    token: string;
    u: UpdateTodo[];
    t: TodoOut[];
};
export type OutCallbackData = {// out callback
    p: string; 
    h: string[]; 
    t: string[];
}
export type CurrentOut = {
    action: 'create', 
    todo: TodoOut
} | {
    action: 'update', 
    todo: UpdateTodo
};
export type Comment = {
    pos: number; 
    type: 'todo'|'heading';
    index: number
};
export type HeadingInfo = {
    id?: string;
    start: number;
    end: number;
    title: string;
}
export type HState = {
    headings: Array<HeadingInfo>;
    hIndex: number;
};
type HStateIn = HState & {
    idMap: Map<string, number>;
}
export type OutContext = {
    // for hierarchy
    taskParent: Map<number, number>;
    // heading processing
    hState: HState;
    output: {
        // output
        projID?: string;
        todos: TodoOut[];
        updates: UpdateTodo[];
        newHeadings: string[];
    };
    // for marker/editing
    newComments: Array<Comment>;
    // current todo
    current?: CurrentOut;
};

export type Insertion = {
    type: 'new',
    pos: number,
    content: string[],
    hIndex: number
};
export type Deletion = {
    type: 'del',
    pos: number,
    end: number,
};
export type Modification = Insertion | Deletion;
export type ChecklistMap = Map<string, string[]>;
type CurrentIn = {
    action: 'delete';// no corresponding todo
    deletion: Deletion;
}|{
    action: 'move';// todo's heading has changed
    indent: number;// indent of the current top level todo in tab number
    clist: ChecklistMap;// checklist of the current top level todo
    deletion: Deletion;
    insertion: Insertion;
}|{
    action: 'none';
    indent: number;// indent of the current top level todo in tab number
    clist: ChecklistMap;// checklist of the current top level todo
    latestPos: number;// latest position of current todo; for inserting new checklists
};
type HeadingList = {
    title: string;
    id: string;
}
export type InContext = {
    // for hierarchy
    taskParent: Map<number, number>;
    // obsidian heading processing
    hState: HStateIn;
    // from things
    input: {
        todos: Map<string,TodoIn>;//id:todo
        tHeadings: Record<string,string>;// id:title
    };
    // mod
    modifications: Modification[];
    docEnd: number;
    // current todo
    current?: CurrentIn;
};
export type InSync = {// in
    f: TFile;
    h: Array<HeadingList>;
    t: TodoIn[];
};
type InData = {// in
    p: ProjectIn;
    h: Array<HeadingList>;
    t: TodoIn[];
};

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
    return isString(value) && value.length > 0;
}
function isThingsStatus(
    value: unknown,
): value is TodoIn['status'] {
    return (
        value === 'Open' ||
        value === 'Completed' ||
        value === 'Canceled'
    );
}
function isProjectIn(
    value: unknown,
): value is ProjectIn {
    return (
        isRecord(value) &&
        isNonEmptyString(value.title) &&
        isNonEmptyString(value.id) &&
        isString(value.notes)
    );
}
function isHeading(
    value: unknown,
): value is HeadingList {
    return (
        isRecord(value) &&
        isNonEmptyString(value.title) &&
        isNonEmptyString(value.id)
    );
}
function isTodoIn(
    value: unknown,
): value is TodoIn {
    return (
        isRecord(value) &&
        isNonEmptyString(value.title) &&
        isNonEmptyString(value.id) &&
        isThingsStatus(value.status) &&
        isNonEmptyString(value.hid) &&
        isString(value.checklist)
    );
}
function isInData(
    value: unknown,
): value is InData {
    return (
        isRecord(value) &&
        isProjectIn(value.p) &&
        Array.isArray(value.h) &&
        value.h.every(isHeading) &&
        Array.isArray(value.t) &&
        value.t.every(isTodoIn)
    );
}

export function parseInboundData(
    raw: unknown,
): InData[] {
    if (typeof raw !== 'string') {
        throw new Error('Inbound data must be a JSON string.');
    }

    let value: unknown;

    try {
        value = JSON.parse(raw);
    } catch {
        throw new Error('Inbound data is not valid JSON.');
    }

    if (!Array.isArray(value)) {
        throw new Error('Inbound data must be an array.');
    }

    if (!value.every(isInData)) {
        throw new Error('Inbound data has an invalid structure.');
    }

    return value;
}

function isOutCallbackData(
    value: unknown,
): value is OutCallbackData {
    return (
        isRecord(value) &&
        isNonEmptyString(value.p) &&
        Array.isArray(value.h) &&
        value.h.every(isNonEmptyString) &&
        Array.isArray(value.t) &&
        value.t.every(isNonEmptyString)
    );
}
export function parseCallbackData(
    raw: unknown,
): OutCallbackData {
    if (typeof raw !== 'string') {
        throw new Error('Callback result must be a JSON string.');
    }

    let value: unknown;

    try {
        value = JSON.parse(raw);
    } catch {
        throw new Error('Callback result is not valid JSON.');
    }

    if (!isOutCallbackData(value)) {
        throw new Error('Callback result has an invalid structure.');
    }

    return value;
}