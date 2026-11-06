import {
	ListItemCache,
	HeadingCache,
	TFile,
	App,
    Pos,
} from 'obsidian';
import { ThingsPluginSettings } from '../settings';
import type {
    HeadingInfo,
    HState,
    OutContext,
    InContext,
    TodoIn,
    Modification,
    ChecklistMap,
    Insertion,
    Comment,
    Deletion,
    InSync,
    CurrentOut,
    OutCallbackData,
    OutData,
} from './validation';

type Snapshot = {
    checker: string;
    hItems: HeadingCache[];
    lItems: ListItemCache[];
};
const hReg = /<!--things-heading-id:(\w*)-->/g;
const tReg = /<!--things-todo-id:(\w*)-->/g;
const pReg = /<!--things-project-id:(\w*)-->/g;
const commentReg = /<!--things-(heading|todo|project)-id:\w*-->/g;
const failReg = /<!--things-(heading|todo|project)-id:_(\w*)-->/g;

const mdNtodo = {'Open':' ', 'Completed':'x', 'Canceled':'-', 'x': 'Completed', 'X': 'Completed', '-': 'Canceled'};

// title is the todo/checklist title
// line is whole line including continuation, without task symbol and with ending new line
// full line is whole line with indent and the task symbol and ending new line
// title line is the first line, without ending new line, continuation is the rest
// task line is with the task symbol
function getLine(pos: Pos, content: string, ...option: string[]): string {
    if (option.includes('full')) {
        return content.slice(pos.start.offset-pos.start.col, pos.end.offset+1);
    }
    const start = option.includes('task')? pos.start.offset : pos.start.offset+6;
    const line = content.slice(start, pos.end.offset+1);
    const separator = line.indexOf('\n');
    if (option.includes('title')) {
        return line.slice(0, separator);
    }
    if (option.includes('continuation')) {
        return line.slice(separator);
    }
    return line;
}
function getComment(type: 'todo'|'heading'|'project',id: string) {
    return `<!--things-${type}-id:${id}-->`;
}

// convert the status symbol to the status description in Things or vice versa
function statusName(status: string): string {
    if (status in mdNtodo) {
        return mdNtodo[status as keyof typeof mdNtodo];
    }
    return 'Open';
}

// conversion between the status symbol in the note and the status symbol in Things
function statusMD(status: string): string {
    if (status.toLowerCase() === 'x') {
        return 'x';
    }
    if (status === '-') {
        return '~';
    }
    if (status === '~') {
        return '-';
    }
    return ' ';
}
function getStatusFromTodo(oldStatus: string, newStatus: string): string {
    return statusName(oldStatus)===newStatus ? oldStatus : statusName(newStatus);
}
function getStatusFromCheck(oldStatus: string, newStatus: string): string {
    return statusMD(oldStatus)===newStatus?oldStatus:statusMD(newStatus);
}
function findID(line: string, reg: RegExp): string|undefined {
    const matches = line.matchAll(reg);
    for (const match of matches) {
        if (!match[1]!.startsWith('_')) {// found real id
            return match[1];
        }
    } 
    return undefined;
}
function infoFromHItems(hItems: HeadingCache[]): HeadingInfo[] {
    return hItems.map((hItem) => {
        return {
            id: findID(hItem.heading, hReg),
            start: hItem.position.start.offset,
            end: hItem.position.end.offset,
            title: hItem.heading.replaceAll(hReg, ''),
        };
    });
}
function buildIdIndexMap(headings: HeadingInfo[]): Map<string, number> {
    const idMap = new Map<string, number>();
    headings.forEach((hItem, index) => {
        if (hItem.id) {
            idMap.set(hItem.id, index);
        }
    });
    return idMap;
}
function updateHIndex(start: number, hState: HState) {
    while (hState.headings[hState.hIndex+1] && hState.headings[hState.hIndex+1]!.start < start) {
        hState.hIndex++;
    }
}
function toStatusJson(status: string): {completed: boolean, canceled: boolean} {
    if (status.toLowerCase() === 'x') {
        return {completed: true, canceled: false};
    }
    if (status === '-') {
        return {completed: false, canceled: true};
    }
    return {completed: false, canceled: false};
}


function toCheckTitle(pos: Pos, content: string): string {
    return content.slice(pos.start.offset+6, pos.end.offset).replaceAll('\n', ' ');
}

function updateOutContext(listItem: ListItemCache, content: string, ignoreStatus: string, context: OutContext) {
    if (!listItem.task) {
        return;
    }
    const titleLine = getLine(listItem.position, content, 'title');
    const id = findID(titleLine, tReg);
    if (!id && ignoreStatus.includes(listItem.task)) {// ignored
        context.current = undefined;
        return;
    }
    updateHIndex(listItem.position.start.offset, context.hState);
    const heading = context.hState.headings[context.hState.hIndex];
    if (heading && heading.id === undefined) {// new heading; placeholder
        context.output.newHeadings.push(heading.title);// 1-based index for apple shortcut
        const index = context.output.newHeadings.length;
        heading.id = `_${index}`;
        context.newComments.push({pos: heading.end, 
            type: 'heading', 
            index: index,
        });
    }
    if (id) {
        context.current = {
            action: 'update',
            todo: {
                type: 'to-do',
                operation: 'update',
                id: id,
                attributes: {
                    title: titleLine.replaceAll(tReg, ''),
                    ...toStatusJson(listItem.task),
                    'heading-id': heading?.id,
                    'checklist-items': [],
                }
            }
        }
        context.output.updates.push(context.current.todo);
    } else {
        context.current = {
            action: 'create',
            todo: {
                // shortcuts automatically make the first line the title and the rest the notes but url scheme does not
                title: (titleLine+getLine(listItem.position, content, 'continuation')).slice(0,-1).replaceAll(tReg, ''),// bc line is endoffset + 1
                status: statusName(listItem.task) as 'Open' | 'Completed' | 'Canceled',
                hid: heading?.id,
            }
        };
        context.newComments.push({
            pos: listItem.position.start.offset+6+titleLine.length,
            type: 'todo', 
            index: context.output.todos.length,
        });
        context.output.todos.push(context.current.todo);
    }
}
function updateOutCurrentParent(listItem: ListItemCache, content: string, current?: CurrentOut) {
    if (!listItem.task||!current) {
        return;
    }
    if (current.action === 'update') {
        current.todo.attributes['checklist-items'].push({
            type: 'checklist-item',
            attributes: {
                title: toCheckTitle(listItem.position, content),
                ...toStatusJson(listItem.task),
            }
        });
    } else {
        current.todo.checklist ??= '';
        current.todo.checklist += `- [${
            statusMD(listItem.task)
        }] ${
            toCheckTitle(listItem.position, content)
        }\n`;
    }
}
function insertComments(newComments: Array<Comment>, content: string, newProject: boolean): string {
    let newContent = '';
    let lastPos = 0;
    for (const comment of newComments) {
        newContent += content.slice(lastPos, comment.pos).replaceAll(failReg, '') + getComment(comment.type, `_${comment.index}`);
        lastPos = comment.pos;
    }
    newContent += content.slice(lastPos).replaceAll(failReg, '');
    if (newProject) {
        newContent = getComment('project', '_')+'\n' + newContent;
    }
    return newContent;
}

function deleteFullLine(pos: Pos): Deletion {
    return {
        type: 'del',
        pos: pos.start.offset-pos.start.col, 
        end: pos.end.offset+1
    };
}
function getIndentN(str: string): number {
    return str.match(/ {4}|\t/g)?.length??0;
}
function getIndentRegex(indent: number): RegExp {
    
    return new RegExp(`^( {4}|\\t){1,${indent}}`, 'gm');
}
function removeIndent(str: string, indent: number): string {
    if (indent === 0) {
        return str;
    }
    return str.replaceAll(getIndentRegex(indent), '');
}
function flushInCurrent(context: InContext) {
    if (context.current) {
        // flush current modification
        switch (context.current.action) {
            // @ts-expect-error TS7029: intentional fall-through
            case 'move':
                context.modifications.push(context.current.insertion);
                // falls through
            case 'delete':
                context.modifications.push(context.current.deletion);
        }
        if (context.current.action !== 'delete' && context.current.clist.size > 0) {
            // flush the checklist of the previous top level todo
            // add the left checklist items to the note
            for (const [title, statuses] of context.current.clist) {
                for (const status of statuses) {
                    const cl = `\t- [${statusMD(status)}] ${title}\n`;
                    if (context.current.action === 'move') {
                        context.current.insertion.content.push(cl);
                    } else {
                        context.modifications.push({
                            type: 'new',
                            pos: context.current.latestPos+1, 
                            content: ['\t'.repeat(context.current.indent)+cl],
                            hIndex: context.hState.hIndex
                        });
                    }
                }
            }
        }
        context.current = undefined;
    }
}
function getHIndexByHId(hid: string, context: InContext): number {
    let hIndex = context.hState.idMap.get(hid);
    if (hIndex === undefined) {
        hIndex = context.hState.headings.length;
        context.hState.headings.push({id: hid, start: context.docEnd, end: 0, title: ''});
        context.hState.idMap.set(hid, hIndex);
        context.modifications.push({
            type: 'new',
            pos: context.docEnd, 
            content: [`## ${context.input.tHeadings[hid]}${getComment('heading', hid)}\n`],
            hIndex: hIndex
        });
    }
    return hIndex;
}
function getTaskTitleFromTodo(todo: TodoIn, oldStatus?: string): string {
    return `- [${
        oldStatus?getStatusFromTodo(oldStatus, todo.status):statusName(todo.status)
    }] ${todo.title}${getComment('todo', todo.id)}`;
}
function createTaskFromTodo(todo: TodoIn, context: InContext, oldStatus?: string, continuation?: string): Insertion {
    const hIndex = getHIndexByHId(todo.hid, context);
    const newLine = getTaskTitleFromTodo(todo, oldStatus);
    return {
        type: 'new',
        pos: (context.hState.headings[hIndex+1]?.start??context.docEnd), 
        content: [continuation ? newLine+continuation : newLine], 
        hIndex: hIndex
    };
}
function getNewStatusForChecklist(listItem: ListItemCache, content: string, clist: ChecklistMap): string|undefined {
    if (!listItem.task) {
        return undefined;
    }
    const title = toCheckTitle(listItem.position, content);
    const statuses = clist.get(title);
    if (statuses) {// update checklist
        const status: string = getStatusFromCheck(listItem.task,statuses.pop()!);
        if (statuses.length === 0) {
            clist.delete(title);
        }
        return status;
    } else {
        return undefined;
    }
}
function getTodoById(id: string, todos: Map<string,TodoIn>): TodoIn|undefined {
    const todo = todos.get(id);
    if (todo) {
        todos.delete(id);
    }
    return todo;
}
function applyModifications(content: string, modifications: Modification[]): string {
    const ops = modifications
        .map((item, index) => ({item, index}))
        .sort((a, b) => {
            const offsetOrder = a.item.pos - b.item.pos;// first offset
            if (offsetOrder !== 0) {
                return offsetOrder;
            }
            const aHIndex = a.item.type === 'new' ? a.item.hIndex : Infinity;// new first delete later
            const bHIndex = b.item.type === 'new' ? b.item.hIndex : Infinity;
            const hIndexOrder = aHIndex - bHIndex;// second hIndex, to make sure new headings' todos are grouped together with the heading
            return hIndexOrder !== 0 ? hIndexOrder : a.index - b.index;// third index, to make sure new headings' todos are inserted after the heading and also maintain order mostly
        })
        .map(({item}) => item);
    let pos: number = 0;
    let newContent: string = '';
    for (const op of ops) {
        if (op.pos < pos) {
            throw new Error('Overlapping or out-of-order modifications detected.');
        }
        newContent += content.slice(pos, op.pos);
        if (op.type === 'del') {
            pos = op.end;
        } else {
            newContent += op.content.join('');
            pos = op.pos;
        }
    }
    newContent += content.slice(pos);
    return newContent.slice(0, -1);// remove the added new line
}
export class SyncEngine {

    constructor(private app: App, private settings: ThingsPluginSettings) {
    }

    private async getSnapshot(file: TFile): Promise<Snapshot> {
        const checker = await this.app.vault.cachedRead(file);
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) {
            throw new Error('The note has not been cached yet. Please wait a moment and try again.');
        }
        return {checker, hItems: cache.headings??[], lItems: cache.listItems??[]};
    }
    private async safeProcess(file: TFile, checker: string, processor: (content: string) => string): Promise<void> {
        await this.app.vault.process(file, (content) => {
            if (content !== checker) {
                throw new Error('The note has uncached modifications. Please wait a moment and try again.');
            }
            return processor(content);
        });
    }
    private getArea(file: TFile): string | undefined {
        let candidates: string[];
        switch (this.settings.areaLoc) {
            case 'backlinks':
                candidates = Object.entries(this.app.metadataCache.resolvedLinks).filter(([_, dest]) => file.path in dest).map(([source, _]) => source);
                break;
            case 'tags':
                candidates = this.app.metadataCache.getFileCache(file)?.tags?.map((tag) => tag.tag) ?? [];
                break;
            case 'path':
                candidates = [file.path];
                break;
            default:
                candidates = [];
        }
        return this.settings.areaNames.toLowerCase().split(';').filter(Boolean)// remove empty 
            .find((areaName)=>candidates.some((source) => source.toLowerCase().includes(areaName)));
    }
    async outbound(file: TFile): Promise<OutData> {      
        const {checker, hItems, lItems} = await this.getSnapshot(file);
        if (lItems.length === 0) {
            throw new Error('No task to sync: cannot find list items in the note.');
        }
        const context: OutContext = {
            taskParent: new Map<number, number>(),// to find parent todo/top level todo
            output: {
                todos: [],// new todos sent to things
                updates: [],// updated todos sent to things
                newHeadings: [],// new headings to create in things
            },
            newComments: [],// add html comments; del is whether to delete placeholder id before pos to insert
            hState: {
                headings: infoFromHItems(hItems),// list of headings in the note
                hIndex: -1,// index of the current heading in cachedHeadings
            }
        };
        await this.safeProcess(file, checker, (content) => {
            content = content+'\n';// align with new line policy when adding new things; will be removed at the end
            for (const listItem of lItems) {
                const parent = context.taskParent.get(listItem.parent);
                if (listItem.task) {// task
                    if (parent===undefined) {// todo
                        context.taskParent.set(listItem.position.start.line, listItem.position.start.line);
                        updateOutContext(listItem, content, this.settings.ignoreStatus,context);
                    } else {// checklist
                        context.taskParent.set(listItem.position.start.line, parent);
                        // append to parent todo
                        if (context.current) {
                            updateOutCurrentParent(listItem, content, context.current);
                        }
                    }
                } else if (parent) {// not a task; pass down taskparent
                    context.taskParent.set(listItem.position.start.line, parent);
                } else {// not a task; top level; reset latest
                    context.current = undefined;
                }
            }
            context.output.projID = findID(content, pReg);
            // insert new comments
            return insertComments(context.newComments, content, context.output.projID === undefined).slice(0, -1);
        });
        // prepare project info
        return {
            p: {
                title: file.basename,
                area: this.getArea(file),
                ...(context.output.projID?
                    {id: context.output.projID}:
                    {notes: `obsidian://open?${new URLSearchParams([
                        ['vault',this.app.vault.getName()],
                        ['file',this.settings.fullPath ? file.path : this.app.metadataCache.fileToLinktext(file,'')]
                    ]).toString().replaceAll('+','%20')}`}
                )
            },
            h: context.output.newHeadings,
            u: context.output.updates,
            t: context.output.todos,
            token: this.settings.token,
        };
    }

    async outCallback (file: TFile, ids: OutCallbackData) {
        await this.app.vault.process(file, (content) => {
            let newContent = content.replaceAll(pReg, getComment('project', ids.p));
            ids.h.forEach((hid: string, index: number) => {
                newContent = newContent.replaceAll(getComment('heading', `_${index+1}`), getComment('heading', `${hid}`));
            });
            ids.t.forEach((tid: string, index: number) => {
                newContent = newContent.replaceAll(getComment('todo', `_${index}`), getComment('todo', `${tid}`));
            });
            return newContent;
        });
    }

    async inbound (sync: InSync) {// for syncing from things3 to obsidian using the things3 shortcut and obsidian url
        const file = sync.f;
        const {checker, hItems, lItems} = await this.getSnapshot(file);
        await this.safeProcess(file, checker, (content)=>{
            content = content+'\n';// align with new line policy when adding new things; will be removed at the end
            const headings = [{id: '', start: 0, end: 0, title: ''}, ...infoFromHItems(hItems)];// first one is for no heading (hid is '')
            const context: InContext = {
                taskParent: new Map<number, number>(),
                hState: {
                    headings,
                    hIndex: -1,// index of the current heading in headings (1 larger than in cachedHeadings)
                    idMap: buildIdIndexMap(headings)
                },
                input: {
                    todos: new Map(sync.t.map((t) => [t.id, t])),
                    tHeadings: Object.fromEntries(sync.h.map((h) => [h.id, h.title])),
                },
                modifications: [],
                docEnd: content.length,
            };

            for (const listItem of [...lItems,{position: {start: {line: 0, col:0, offset: 0}, end: {line: 0, col: 0, offset: 0}}, parent: -1}]) {// flush the last todo's checklist
                const parent = context.taskParent.get(listItem.parent);
                if (parent===undefined) {
                    flushInCurrent(context);
                    if (listItem.task) {// todo
                        context.taskParent.set(listItem.position.start.line, listItem.position.start.line);
                        
                        const taskTitleline = getLine(listItem.position, content, 'task','title');
                        const id = findID(taskTitleline, tReg);
                        if (!id) {
                            continue;
                        }
                        const tTodo = getTodoById(id, context.input.todos);
                        if (tTodo === undefined) {// no corresponding todo in things
                            if (this.settings.deleteUnsynced) {// delete the lines
                                context.current = {
                                    action: 'delete',
                                    deletion: deleteFullLine(listItem.position)
                                };
                            } else {// only delete the id
                                const comment = getComment('todo', id);
                                const index = taskTitleline.indexOf(comment);
                                context.modifications.push({
                                    type: 'del',
                                    pos: listItem.position.start.offset+index,
                                    end: listItem.position.start.offset+index+comment.length
                                });
                            }
                        } else {
                            // update the lines
                            updateHIndex(listItem.position.start.offset, context.hState);
                            const clist = new Map<string, string[]>();
                            for (const cl of tTodo.checklist===''?[]:tTodo.checklist.split('\n')) {// avoid ['']
                                const key = cl.slice(6);
                                if (!clist.has(key)) {
                                    clist.set(key, []);
                                }
                                clist.get(key)!.push(cl[3]!);
                            }
                            for (const statuses of clist.values()) {
                                statuses.reverse();
                            }
                            const indent = getIndentN(content.slice(listItem.position.start.offset-listItem.position.start.col, listItem.position.start.offset));
                            const latestPos = listItem.position.end.offset;
                            // heading change 
                            if (tTodo.hid!==context.hState.headings[context.hState.hIndex]!.id) {
                                context.current = {
                                    action: 'move',
                                    indent: indent,
                                    clist: clist,
                                    deletion: deleteFullLine(listItem.position),
                                    insertion: createTaskFromTodo(tTodo, context, listItem.task, removeIndent(getLine(listItem.position, content, 'continuation'), indent))
                                };
                            } else {
                                context.current = {
                                    action: 'none',
                                    indent: indent,
                                    clist: clist,
                                    latestPos: latestPos,
                                };
                                const newLine = getTaskTitleFromTodo(tTodo, listItem.task);
                                if (taskTitleline !== newLine) {
                                    context.modifications.push({
                                        type: 'del',
                                        pos: listItem.position.start.offset, 
                                        end: listItem.position.start.offset+taskTitleline.length
                                    },{
                                        type: 'new',
                                        pos: listItem.position.start.offset, 
                                        content: [newLine],
                                        hIndex: context.hState.hIndex
                                    });
                                }
                            }
                        }
                    }
                } else {// sublist of a todo
                    context.taskParent.set(listItem.position.start.line, parent);
                    if (context.current) {
                        switch (context.current.action) {
                            case 'none':
                                context.current.latestPos = listItem.position.end.offset;
                                if (listItem.task) {
                                    const status = getNewStatusForChecklist(listItem, content, context.current.clist);
                                    if (status) {// update checklist
                                        if (listItem.task !== status) {
                                            context.modifications.push({
                                                type: 'del',
                                                pos: listItem.position.start.offset, 
                                                end: listItem.position.start.offset+6
                                            },{
                                                type: 'new',
                                                pos: listItem.position.start.offset,
                                                content: [`- [${status}] `],
                                                hIndex: context.hState.hIndex
                                            });
                                        }
                                    } else {// delete checklist
                                        context.modifications.push(deleteFullLine(listItem.position));
                                    }
                                }
                                break;
                            // @ts-expect-error TS7029: intentional fall-through
                            case 'move':
                                if (listItem.task) {// checklist
                                    const status = getNewStatusForChecklist(listItem, content, context.current.clist);
                                    if (status) {// update checklist
                                        context.current.insertion.content.push(
                                            removeIndent(
                                                content.slice(listItem.position.start.offset-listItem.position.start.col, listItem.position.start.offset+3)+
                                                status+
                                                content.slice(listItem.position.start.offset+4, listItem.position.end.offset+1),
                                                context.current.indent
                                            )
                                        );
                                    }
                                } else {// bullet
                                    context.current.insertion.content.push(
                                        removeIndent(getLine(listItem.position, content, 'full'), context.current.indent)
                                    );
                                }
                                // falls through
                            case 'delete':
                                context.current.deletion.end = listItem.position.end.offset+1;
                                break;
                        }
                    }
                }
            }
            // add the left todos to the note
            context.input.todos.forEach((tTodo) => {
                context.modifications.push(
                    createTaskFromTodo(tTodo, context, undefined, '\n')
                );
            });
            return applyModifications(content, context.modifications);
        });
    }

    removeComments(content: string): string {
        return content.replaceAll(commentReg, '');
    }
}