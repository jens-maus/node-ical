/**
 * TypeScript type tests to prevent regressions in type definitions.
 * These tests verify that required fields remain required and optional fields remain optional.
 * This file is compiled with `tsc --noEmit` but never executed.
 */

/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../node-ical.d.ts" />

import type * as ical from 'node-ical';

// ============================================================================
// VEvent Type Tests
// ============================================================================

// Test: VEvent required fields must be provided
const validEvent: ical.VEvent = {
  type: 'VEVENT',
  uid: 'event-123',
  dtstamp: new Date(),
  start: new Date(),
  datetype: 'date-time',
  summary: 'Team Meeting',
};

// Test: VEvent required fields cannot be undefined
const eventUid: string = validEvent.uid;
const eventDtstamp: Date = validEvent.dtstamp;
const eventStart: Date = validEvent.start;
const eventDatetype: ical.DateType = validEvent.datetype;
const eventSummary: ical.ParameterValue = validEvent.summary;

// Test: VEvent optional fields can be undefined
const eventMethod: ical.Method | undefined = validEvent.method;
const eventLocation: ical.ParameterValue | undefined = validEvent.location;
const eventEnd: ical.DateWithTimeZone | undefined = validEvent.end;
const eventDescription: ical.ParameterValue | undefined = validEvent.description;
const eventOrganizer: ical.Organizer | undefined = validEvent.organizer;
const eventSequence: number | undefined = validEvent.sequence;
const eventClass: ical.Class | undefined = validEvent.class;
const eventUrl: string | undefined = validEvent.url;
const eventCreated: ical.DateWithTimeZone | undefined = validEvent.created;
const eventLastmodified: ical.DateWithTimeZone | undefined = validEvent.lastmodified;

// Test: VEvent with all optional fields
const fullEvent: ical.VEvent = {
  type: 'VEVENT',
  uid: 'event-456',
  dtstamp: new Date(),
  start: new Date(),
  datetype: 'date-time',
  summary: 'Conference',
  method: 'PUBLISH',
  location: 'Room 123',
  end: new Date(),
  description: 'Annual conference',
  organizer: {params: {}, val: 'mailto:admin@example.com'},
  sequence: 1,
  class: 'PUBLIC',
  url: 'https://example.com/event',
  created: new Date(),
  lastmodified: new Date(),
  rrule: ({} as unknown) as ical.RRule,
  status: 'CONFIRMED',
  transparency: 'OPAQUE',
  attendee: [],
  categories: ['Meeting'],
  recurrences: {},
  alarms: [],
};

// ============================================================================
// VTodo Type Tests
// ============================================================================

// Test: VTodo required fields must be provided
const validTodo: ical.VTodo = {
  type: 'VTODO',
  uid: 'todo-123',
  dtstamp: new Date(),
};

// Test: VTodo required fields cannot be undefined
const todoUid: string = validTodo.uid;
const todoDtstamp: Date = validTodo.dtstamp;

// Test: VTodo optional fields can be undefined
const todoSummary: ical.ParameterValue | undefined = validTodo.summary;
const todoDescription: ical.ParameterValue | undefined = validTodo.description;
const todoStart: ical.DateWithTimeZone | undefined = validTodo.start;
const todoDue: ical.DateWithTimeZone | undefined = validTodo.due;
const todoCompleted: ical.DateWithTimeZone | undefined = validTodo.completed;
const todoCompletion: string | undefined = validTodo.completion;
const todoStatus: ical.VTodoStatus | undefined = validTodo.status;
const todoPriority: number | undefined = validTodo.priority;

// Test: VTodo with all optional fields
const fullTodo: ical.VTodo = {
  type: 'VTODO',
  uid: 'todo-456',
  dtstamp: new Date(),
  summary: 'Fix bug',
  description: 'Fix the login issue',
  start: new Date(),
  due: new Date(),
  completed: new Date(),
  completion: '50',
  status: 'IN-PROCESS',
  priority: 1,
  sequence: 0,
  class: 'PUBLIC',
  organizer: {params: {}, val: 'mailto:admin@example.com'},
  categories: ['Bug'],
  recurrences: {},
  alarms: [],
};

// ============================================================================
// VJournal Type Tests
// ============================================================================

// Test: VJournal required fields must be provided
const validJournal: ical.VJournal = {
  type: 'VJOURNAL',
  uid: 'journal-123',
  dtstamp: new Date(),
};

// Test: VJournal required fields cannot be undefined
const journalUid: string = validJournal.uid;
const journalDtstamp: Date = validJournal.dtstamp;

// Test: VJournal optional fields can be undefined
const journalSummary: ical.ParameterValue | undefined = validJournal.summary;
const journalDescription: ical.ParameterValue | undefined = validJournal.description;
const journalStart: ical.DateWithTimeZone | undefined = validJournal.start;
const journalStatus: ical.VJournalStatus | undefined = validJournal.status;

// Test: VJournal with all optional fields
const fullJournal: ical.VJournal = {
  type: 'VJOURNAL',
  uid: 'journal-456',
  dtstamp: new Date(),
  summary: 'Daily log',
  description: 'Notes from today',
  start: new Date(),
  status: 'FINAL',
  sequence: 0,
  class: 'PRIVATE',
  organizer: {params: {}, val: 'mailto:admin@example.com'},
  categories: ['Log'],
  recurrences: {},
};

// ============================================================================
// CalendarResponse Type Tests
// ============================================================================

// Test: Parsed calendar response
const calendarData: ical.CalendarResponse = {
  vcalendar: {
    type: 'VCALENDAR',
    version: '2.0',
    prodid: '-//Test//Test//EN',
  },
  'event-123': validEvent,
  'todo-123': validTodo,
  'journal-123': validJournal,
};

// Test: Type guards work correctly
for (const component of Object.values(calendarData)) {
  if (component && typeof component === 'object' && 'type' in component) {
    switch (component.type) {
      case 'VEVENT': {
        // Required fields must be accessible without null checks
        const eventId: string = component.uid;
        const eventTimestamp: Date = component.dtstamp;
        const eventStartTime: Date = component.start;
        break;
      }

      case 'VTODO': {
        // Required fields must be accessible without null checks
        const todoId: string = component.uid;
        const todoTimestamp: Date = component.dtstamp;
        break;
      }

      case 'VJOURNAL': {
        // Required fields must be accessible without null checks
        const journalId: string = component.uid;
        const journalTimestamp: Date = component.dtstamp;
        break;
      }

      case 'VCALENDAR':
      case 'VTIMEZONE':
      case 'VFREEBUSY': {
        // These component types don't have our required field constraints
        break;
      }
    }
  }
}

// If this file compiles, all type constraints are correct.
