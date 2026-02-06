declare module 'node-ical' {
  /**
   * Compatibility wrapper returned by node-ical (RRULE results are Date-based).
   * Mirrors the public surface of the internal RRuleCompatWrapper.
   */
  export type RRule = {
    options: Record<string, unknown> & {byweekday?: Array<string | number>};
    between: (after: Date, before: Date, inclusive?: boolean) => Date[];
    all: (iterator?: (date: Date, index: number) => boolean | void) => Date[];
    before: (date: Date, inclusive?: boolean) => Date | undefined;
    after: (date: Date, inclusive?: boolean) => Date | undefined;
    toText: (locale?: string) => string;
    toString: () => string;
  };

  /**
   * Minimal Fetch options type (subset of RequestInit) to avoid requiring DOM lib.
   */
  export type FetchOptions = {
    method?: string;
    /**
     * Accept common header container shapes without depending on DOM lib types.
     * - Plain object map
     * - Any iterable of [key,value] tuples (covers Arrays and WHATWG Headers at runtime)
     */
    headers?: Record<string, string> | Iterable<[string, string]>;
    /** Request body (caller supplied) */
    body?: unknown;
    /** Additional fetch options (e.g. agent, redirect, follow, timeout, signal, etc.) */
    [key: string]: unknown;
  };

  /**
     * Methods (Sync)
     */
  export type NodeICalSync = {
    parseICS: (body: string) => CalendarResponse;

    parseFile: (file: string) => CalendarResponse;
  };

  export const sync: NodeICalSync;

  /**
     * Methods (Async)
     */
  export type NodeICalAsync = {
    fromURL: ((url: string, callback: NodeIcalCallback) => void) & ((url: string, options: FetchOptions | NodeIcalCallback, callback?: NodeIcalCallback) => void) & ((url: string) => Promise<CalendarResponse>);

    parseICS: ((body: string, callback: NodeIcalCallback) => void) & ((body: string) => Promise<CalendarResponse>);

    parseFile: ((file: string, callback: NodeIcalCallback) => void) & ((file: string) => Promise<CalendarResponse>);
  };

  export const async: NodeICalAsync;

  /**
     * Methods (Autodetect)
     */
  export function fromURL(url: string, callback: NodeIcalCallback): void;

  export function fromURL(url: string, options: FetchOptions | NodeIcalCallback, callback?: NodeIcalCallback): void;

  export function fromURL(url: string): Promise<CalendarResponse>;

  export function parseICS(body: string, callback: NodeIcalCallback): void;

  export function parseICS(body: string): CalendarResponse;

  export function parseFile(file: string, callback: NodeIcalCallback): void;

  export function parseFile(file: string): CalendarResponse;

  /**
   * Expand a recurring event into individual instances within a date range.
   *
   * @param event - The VEVENT component to expand
   * @param options - Expansion options
   * @param options.from - Start of date range (inclusive)
   * @param options.to - End of date range (inclusive)
   * @param options.includeOverrides - Whether to apply RECURRENCE-ID overrides (default: true)
   * @param options.excludeExdates - Whether to exclude EXDATE dates (default: true)
   * @param options.expandOngoing - Whether to include events that started before range but are still ongoing (default: false)
   * @returns Array of event instances sorted by start date
   *
   * @example
   * ```typescript
   * const events = ical.sync.parseFile('calendar.ics');
   * const event = Object.values(events).find(e => e.type === 'VEVENT' && e.rrule);
   *
   * const instances = ical.expandRecurringEvent(event, {
   *   from: new Date('2024-01-01'),
   *   to: new Date('2024-12-31')
   * });
   *
   * instances.forEach(instance => {
   *   console.log(`${instance.summary}: ${instance.start} - ${instance.end}`);
   *   console.log(`Full-day: ${instance.isFullDay}, Recurring: ${instance.isRecurring}`);
   * });
   * ```
   */
  export function expandRecurringEvent(
    event: VEvent,
    options: ExpandRecurringEventOptions,
  ): EventInstance[];

  /**
   * Options for expanding recurring events
   */
  export type ExpandRecurringEventOptions = {
    /** Start of date range (inclusive) */
    from: Date;
    /** End of date range (inclusive) */
    to: Date;
    /** Whether to apply RECURRENCE-ID overrides (default: true) */
    includeOverrides?: boolean;
    /** Whether to exclude EXDATE dates (default: true) */
    excludeExdates?: boolean;
    /** Whether to include events that started before range but are still ongoing (default: false) */
    expandOngoing?: boolean;
  };

  /**
   * An individual instance of a recurring or non-recurring event
   */
  export type EventInstance = {
    /** Start date/time of this instance */
    start: Date;
    /** End date/time of this instance */
    end: Date;
    /** Event summary/title - copied from event, may include params */
    summary: ParameterValue;
    /** Whether this is a full-day event (date-only, no time component) */
    isFullDay: boolean;
    /** Whether this instance came from a recurring rule */
    isRecurring: boolean;
    /** Whether this instance is a RECURRENCE-ID override of the base event */
    isOverride: boolean;
    /** The VEVENT object for this instance (base event or override) */
    event: VEvent;
  };

  /**
     * Response objects
     */
  export type NodeIcalCallback = (error: any, data: CalendarResponse | undefined) => void;

  /**
   * Response from parsing an iCalendar file.
   * Contains calendar components indexed by UID, plus an optional vcalendar object
   * with VCALENDAR-level properties (e.g., WR-CALNAME, WR-TIMEZONE, method, version).
   */
  export type CalendarResponse = {
    /** VCALENDAR-level properties (calendar metadata) */
    vcalendar?: VCalendar;
    /** Calendar components (events, todos, etc.) indexed by UID */
    [uid: string]: CalendarComponent | VCalendar | undefined;
  };

  export type CalendarComponent = VTimeZone | VEvent | VTodo | VJournal | VFreebusy | VCalendar;

  export type VTimeZone = TimeZoneProps & TimeZoneDictionary;

  type TimeZoneProps = {
    type: 'VTIMEZONE';
    tzid: string;
    tzurl?: string;
  } & BaseComponent;

  type TimeZoneDictionary = Record<string, TimeZoneDef | undefined>;

  /**
   * Example :
   * TRIGGER:-P15M
   * TRIGGER;RELATED=END:P5M
   * TRIGGER;VALUE=DATE-TIME:19980101T050000Z
   */
  type Trigger = string;

  /**
   * https://www.kanzaki.com/docs/ical/valarm.html
   */
  export type VAlarm = {
    type: 'VALARM';
    action: 'AUDIO' | 'DISPLAY' | 'EMAIL' | 'PROCEDURE';
    trigger: Trigger;
    description?: string;
    /**
     * https://www.kanzaki.com/docs/ical/repeat.html
     */
    repeat?: number;
    /**
     * Time between repeated alarms (if repeat is set)
     * DURATION:PT15M
     */
    duration?: unknown;
    /**
     * Everything except DISPLAY
     * https://www.kanzaki.com/docs/ical/attach.html
     */
    attach: unknown;
    /**
     * For action = email
     */
    summary?: string;

    /**
     * For action = email
     */
    attendee?: Attendee;

  } & BaseComponent;

  /**
   * Common properties shared by calendar components (VEVENT, VTODO, VJOURNAL)
   * that support recurrence and scheduling.
   */
  type CalendarComponentCommon = {
    uid?: string;
    dtstamp?: DateWithTimeZone;
    sequence?: number;
    summary?: ParameterValue;
    description?: ParameterValue;
    start?: DateWithTimeZone;
    datetype?: DateType;
    created?: DateWithTimeZone;
    lastmodified?: DateWithTimeZone;
    class?: Class;
    url?: string;
    organizer?: Organizer;
    attendee?: Attendee[] | Attendee;
    categories?: string[];
    rrule?: RRule;
    recurrenceid?: DateWithTimeZone;
    exdate?: Record<string, DateWithTimeZone>;
  };

  export type VEvent = CalendarComponentCommon & {
    type: 'VEVENT';
    // RFC 5545 required fields (override optional from CalendarComponentCommon)
    uid: string;
    dtstamp: DateWithTimeZone;
    start: DateWithTimeZone;
    datetype: DateType;
    summary: ParameterValue;
    // VEvent-specific fields
    method?: Method;
    /** Event location – may include params (e.g., LANGUAGE, ALTREP) */
    location?: ParameterValue;
    end?: DateWithTimeZone;
    transparency?: Transparency;
    completion?: string;
    geo?: any;
    status?: VEventStatus;
    /**
     * Modified instances of recurring events (RECURRENCE-ID overrides).
     * Uses dual-key approach for RFC 5545 compliance:
     * - Date-only key (YYYY-MM-DD) for simple lookups
     * - Full ISO timestamp key for DATE-TIME recurrence instances
     * Both keys reference the same event object.
     *
     * @example
     * // Access recurrence by date
     * const override = event.recurrences?.['2024-07-15'];
     * // Access recurrence by specific time
     * const override = event.recurrences?.['2024-07-15T14:00:00.000Z'];
     */
    recurrences?: Record<string, Omit<VEvent, 'recurrences'>>;
    alarms?: VAlarm[];
  } & BaseComponent;

  /**
   * Todo status values as defined in RFC 5545
   */
  export type VTodoStatus = 'NEEDS-ACTION' | 'COMPLETED' | 'IN-PROCESS' | 'CANCELLED';

  /**
   * Journal status values as defined in RFC 5545
   */
  export type VJournalStatus = 'DRAFT' | 'FINAL' | 'CANCELLED';

  /**
   * VTODO component representing a task or to-do item.
   *
   * @example
   * const data = ical.parseICS(icsString);
   * const todos = Object.values(data).filter(item => item.type === 'VTODO');
   * todos.forEach(todo => {
   *   console.log(`Task: ${todo.summary}`);
   *   console.log(`Due: ${todo.due}`);
   *   console.log(`Completed: ${todo.completion}%`);
   * });
   */
  export type VTodo = CalendarComponentCommon & {
    type: 'VTODO';
    // RFC 5545 required fields (override optional from CalendarComponentCommon)
    uid: string;
    dtstamp: DateWithTimeZone;
    // VTodo-specific fields
    method?: Method;
    /** Task location – may include params (e.g., LANGUAGE, ALTREP) */
    location?: ParameterValue;
    /** When this task is due */
    due?: DateWithTimeZone;
    /** When this task was completed */
    completed?: DateWithTimeZone;
    /** Percentage of task completion (0-100) */
    completion?: string;
    status?: VTodoStatus;
    /** Task priority (0 = undefined, 1 = highest, 9 = lowest) */
    priority?: number;
    /**
     * Modified instances of recurring todos (RECURRENCE-ID overrides).
     * Uses dual-key approach (date and ISO timestamp).
     */
    recurrences?: Record<string, Omit<VTodo, 'recurrences'>>;
    alarms?: VAlarm[];
  } & BaseComponent;

  /**
   * VJOURNAL component representing a journal entry or note.
   *
   * @example
   * const data = ical.parseICS(icsString);
   * const journals = Object.values(data).filter(item => item.type === 'VJOURNAL');
   * journals.forEach(journal => {
   *   console.log(`Entry: ${journal.summary}`);
   *   console.log(`Description: ${journal.description}`);
   * });
   */
  export type VJournal = CalendarComponentCommon & {
    type: 'VJOURNAL';
    // RFC 5545 required fields (override optional from CalendarComponentCommon)
    uid: string;
    dtstamp: DateWithTimeZone;
    // VJournal-specific fields
    method?: Method;
    status?: VJournalStatus;
    /**
     * Modified instances of recurring journals (RECURRENCE-ID overrides).
     * Uses dual-key approach (date and ISO timestamp).
     */
    recurrences?: Record<string, Omit<VJournal, 'recurrences'>>;
  } & BaseComponent;

  /**
   * Free/busy time type as defined in RFC 5545
   */
  export type FreebusyType = 'FREE' | 'BUSY' | 'BUSY-UNAVAILABLE' | 'BUSY-TENTATIVE';

  /**
   * Free/busy period with start and end times
   */
  export type FreebusyPeriod = {
    /** Free/busy period type */
    type: FreebusyType;
    /** Start time of the period */
    start: DateWithTimeZone;
    /** End time of the period */
    end: DateWithTimeZone;
  };

  /**
   * VFREEBUSY component representing free/busy time information.
   * Used to publish or request free/busy time for calendar users.
   *
   * @example
   * const data = ical.parseICS(icsString);
   * const freebusy = Object.values(data).find(item => item.type === 'VFREEBUSY');
   * if (freebusy) {
   *   console.log(`Free/busy for: ${freebusy.organizer}`);
   *   freebusy.freebusy?.forEach(period => {
   *     console.log(`${period.type}: ${period.start} - ${period.end}`);
   *   });
   * }
   */
  export type VFreebusy = {
    type: 'VFREEBUSY';
    method?: Method;
    uid?: string;
    /** Organizer of the free/busy time (optional, not always present) */
    organizer?: Organizer;
    /** Start of free/busy period */
    start?: DateWithTimeZone;
    /** End of free/busy period */
    end?: DateWithTimeZone;
    dtstamp?: DateWithTimeZone;
    /** URL to access the free/busy information */
    url?: string;
    /** Array of free/busy time periods */
    freebusy?: FreebusyPeriod[];
    /** Attendee information */
    attendee?: Attendee[] | Attendee;
  } & BaseComponent;

  /**
   * VCALENDAR component containing calendar-level metadata.
   * Accessible via data.vcalendar after parsing.
   *
   * Note: X-prefixed properties (e.g., X-WR-CALNAME) have the 'X-' prefix removed
   * by node-ical, so X-WR-CALNAME becomes WR-CALNAME in the parsed output.
   *
   * @example
   * const data = ical.parseICS(icsString);
   * const calendarName = data.vcalendar?.['WR-CALNAME'];
   * const timezone = data.vcalendar?.['WR-TIMEZONE'];
   */
  export type VCalendar = {
    type: 'VCALENDAR';
    prodid?: string;
    version?: string;
    calscale?: 'GREGORIAN' | string;
    method?: Method;
    /** Calendar name (X-WR-CALNAME in ICS file) */
    'WR-CALNAME'?: string;
    /** Calendar description (X-WR-CALDESC in ICS file) */
    'WR-CALDESC'?: string;
    /** Default timezone (X-WR-TIMEZONE in ICS file) */
    'WR-TIMEZONE'?: string;
  };

  export type BaseComponent = Record<string, unknown>;

  export type TimeZoneDef = {
    type: 'DAYLIGHT' | 'STANDARD';
    params: any[];
    tzoffsetfrom: string;
    tzoffsetto: string;
    tzname: string;
    start: DateWithTimeZone;
    dateType: DateType;
    rrule: string;
    rdate: string | string[];
  };

  /**
   * A property value that may include iCalendar parameters.
   *
   * When an iCalendar property has parameters (e.g., `SUMMARY;LANGUAGE=de:Restmuell`),
   * node-ical returns an object with `params` and `val`. Without parameters, it returns
   * the plain value directly.
   *
   * @example
   * // Without parameters: string
   * event.summary // => "Meeting"
   *
   * // With parameters: object
   * event.summary // => { params: { LANGUAGE: "de" }, val: "Besprechung" }
   *
   * // Safe access pattern:
   * const title = typeof event.summary === 'string'
   *   ? event.summary
   *   : event.summary.val;
   */
  export type ParameterValue<T = string, P = Record<string, string>> = T | {
    /** The actual property value */
    val: T;
    /** ICalendar parameters (e.g., LANGUAGE, ENCODING) */
    params: P;
  };

  export type Organizer = ParameterValue<string, {
    /** Common Name - display name of the organizer */
    CN?: string;
    /** Directory entry reference */
    DIR?: string;
    /** Sent by delegate */
    'SENT-BY'?: string;
    /** Language for text values */
    LANGUAGE?: string;
    /** Schedule agent */
    'SCHEDULE-AGENT'?: string;
    /** Allow additional parameters from parseParameters() */
    [key: string]: string | undefined;
  }>;

  export type Attendee = ParameterValue<string, {
    /** Calendar user type */
    CUTYPE?: AttendeeCUType;
    /** Participation role */
    ROLE?: AttendeeRole;
    /** Participation status */
    PARTSTAT?: AttendeePartStat;
    /** RSVP expectation */
    RSVP?: boolean;
    /** Common Name - display name of attendee */
    CN?: string;
    /** Number of guests (non-standard) */
    'X-NUM-GUESTS'?: number;
    /** Delegated to */
    'DELEGATED-TO'?: string;
    /** Delegated from */
    'DELEGATED-FROM'?: string;
    /** Group membership */
    MEMBER?: string;
    /** Directory entry reference */
    DIR?: string;
    /** Language for text values */
    LANGUAGE?: string;
    /** Allow additional parameters from parseParameters() */
    [key: string]: string | number | boolean | undefined;
  }>;

  export type AttendeeCUType = 'INDIVIDUAL' | 'UNKNOWN' | 'GROUP' | 'ROOM' | string;
  export type AttendeeRole = 'CHAIR' | 'REQ-PARTICIPANT' | 'NON-PARTICIPANT' | string;
  export type AttendeePartStat = 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'DELEGATED';

  export type DateWithTimeZone = Date & {tz?: string; dateOnly?: true};
  export type DateType = 'date-time' | 'date';
  export type Transparency = 'TRANSPARENT' | 'OPAQUE';
  export type Class = 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
  export type Method = 'PUBLISH' | 'REQUEST' | 'REPLY' | 'ADD' | 'CANCEL' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER';
  export type VEventStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
}
