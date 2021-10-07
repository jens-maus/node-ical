declare module 'node-ical' {
  import {AxiosRequestConfig} from 'axios';
  import {RRule} from 'rrule';

  /**
     * Methods (Sync)
     */
  export interface NodeICalSync {
    parseICS: (body: string) => CalendarResponse;

    parseFile: (file: string) => CalendarResponse;
  }

  export const sync: NodeICalSync;

  /**
     * Methods (Async)
     */
  export interface NodeICalAsync {
    fromURL: ((url: string, callback: NodeIcalCallback) => void) & ((url: string, options: AxiosRequestConfig | NodeIcalCallback, callback?: NodeIcalCallback) => void) & ((url: string) => Promise<CalendarResponse>);

    parseICS: ((body: string, callback: NodeIcalCallback) => void) & ((body: string) => Promise<CalendarResponse>);

    parseFile: ((file: string, callback: NodeIcalCallback) => void) & ((file: string) => Promise<CalendarResponse>);
  }

  export const async: NodeICalAsync;

  /**
     * Methods (Autodetect)
     */
  export function fromURL(url: string, callback: NodeIcalCallback): void;

  export function fromURL(url: string, options: AxiosRequestConfig | NodeIcalCallback, callback?: NodeIcalCallback): void;

  export function fromURL(url: string): Promise<CalendarResponse>;

  export function parseICS(body: string, callback: NodeIcalCallback): void;

  export function parseICS(body: string): CalendarResponse;

  export function parseFile(file: string, callback: NodeIcalCallback): void;

  export function parseFile(file: string): CalendarResponse;

  /**
     * Response objects
     */
  export type NodeIcalCallback = (error: any, data: CalendarResponse) => void;

  export type CalendarResponse = Record<string, CalendarComponent>;

  export type CalendarComponent = VTimeZone | VEvent;

  export type VTimeZone = TimeZoneProps & TimeZoneDictionary;

  interface TimeZoneProps extends BaseComponent {
    type: 'VTIMEZONE';
    tzid: string;
    tzurl: string;
  }

  type TimeZoneDictionary = Record<string, TimeZoneDef | undefined>;

  export interface VEvent extends BaseComponent {
    type: 'VEVENT';
    method: Method;
    dtstamp: DateWithTimeZone;
    uid: string;
    sequence: string;
    transparency: Transparency;
    class: Class;
    summary: string;
    start: DateWithTimeZone;
    datetype: DateType;
    end: DateWithTimeZone;
    location: string;
    description: string;
    url: string;
    completion: string;
    created: DateWithTimeZone;
    lastmodified: DateWithTimeZone;
    rrule?: RRule;
    attendee?: Attendee[] | Attendee;
    recurrences?: {[dateKey: string]: Omit<VEvent, 'recurrences'>};

    // I am not entirely sure about these, leave them as any for now..
    organizer: Organizer;
    exdate: any;
    geo: any;
    recurrenceid: any;
  }

  export interface BaseComponent {
    params: any[];
  }

  export interface TimeZoneDef {
    type: 'DAYLIGHT' | 'STANDARD';
    params: any[];
    tzoffsetfrom: string;
    tzoffsetto: string;
    tzname: string;
    start: DateWithTimeZone;
    dateType: DateType;
    rrule: string;
    rdate: string | string[];
  }

  type Property<A> = PropertyWithArgs<A> | string;

  interface PropertyWithArgs<A> {
    val: string;
    params: A & Record<string, unknown>;
  }

  export type Organizer = Property<{
    CN?: string;
  }>;

  export type Attendee = Property<{
    CUTYPE?: 'INDIVIDUAL' | 'UNKNOWN' | 'GROUP' | 'ROOM' | string;
    ROLE?: 'CHAIR' | 'REQ-PARTICIPANT' | 'NON-PARTICIPANT' | string;
    PARTSTAT?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'DELEGATED';
    RSVP?: boolean;
    CN?: string;
    'X-NUM-GUESTS'?: number;
  }>;

  export type DateWithTimeZone = Date & {tz: string};
  export type DateType = 'date-time' | 'date';
  export type Transparency = 'TRANSPARENT' | 'OPAQUE';
  export type Class = 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
  export type Method = 'PUBLISH' | 'REQUEST' | 'REPLY' | 'ADD' | 'CANCEL' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER';
}
