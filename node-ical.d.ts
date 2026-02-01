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
    /** Event summary/title */
    summary: string;
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

  export type CalendarResponse = Record<string, CalendarComponent>;

  export type CalendarComponent = VTimeZone | VEvent | VCalendar;

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

  export type VEvent = {
    type: 'VEVENT';
    method: Method;
    dtstamp: DateWithTimeZone;
    uid: string;
    sequence: string;
    transparency: Transparency;
    class: Class;
    /** Event title/summary – may include params (e.g., LANGUAGE) */
    summary: ParameterValue;
    start: DateWithTimeZone;
    datetype: DateType;
    end: DateWithTimeZone;
    /** Event location – may include params (e.g., LANGUAGE, ALTREP) */
    location: ParameterValue;
    /** Event description – may include params (e.g., LANGUAGE, ALTREP) */
    description: ParameterValue;
    url: string;
    completion: string;
    created: DateWithTimeZone;
    lastmodified: DateWithTimeZone;
    rrule?: RRule;
    attendee?: Attendee[] | Attendee;
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
    status?: VEventStatus;

    // I am not entirely sure about these, leave them as any for now..
    organizer: Organizer;
    /**
     * Exception dates (EXDATE) – dates excluded from recurrence.
     * Uses dual-key approach for RFC 5545 compliance:
     * - Date-only key (YYYY-MM-DD) for VALUE=DATE and simple lookups
     * - Full ISO timestamp key for VALUE=DATE-TIME entries
     * Both keys reference the same Date object.
     *
     * @example
     * // Check if a date is excluded
     * if (event.exdate?.['2024-07-15']) { ... }
     * // Check if specific time instance is excluded
     * if (event.exdate?.['2024-07-15T14:00:00.000Z']) { ... }
     */
    exdate?: Record<string, DateWithTimeZone>;
    geo: any;
    /**
     * Recurrence ID for modified instances of recurring events.
     * When present on a VEVENT, indicates this is an override of a specific recurrence.
     */
    recurrenceid?: DateWithTimeZone;

    alarms?: VAlarm[];
  } & BaseComponent;

  /**
   * Contains alls metadata of the Calendar
   */
  export type VCalendar = {
    type: 'VCALENDAR';
    prodid?: string;
    version?: string;
    calscale?: 'GREGORIAN' | string;
    method?: Method;
    'WR-CALNAME'?: string;
    'WR-CALDESC'?: string;
    'WR-TIMEZONE'?: string;
  } & BaseComponent;

  export type BaseComponent = {
    params: any[];
  };

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
