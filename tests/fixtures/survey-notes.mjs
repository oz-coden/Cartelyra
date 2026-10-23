import {readFile} from 'node:fs/promises';
export const surveyNotes=await readFile(new URL('../../docs/survey-notes.md',import.meta.url),'utf8');
export const notesFor=buildingId=>surveyNotes.split(`## ${buildingId.replace(/^b/,'')}号館\n`)[1]?.split(/\n## \d+号館\n/)[0]??'';
