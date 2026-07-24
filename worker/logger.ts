export type LogLevel = "info" | "warn" | "error";
export type CacheState = "hit" | "miss" | "bypass" | "deduplicated" | "not_applicable";

export type StructuredLogInput = {
  timestamp?: string;
  level: LogLevel;
  event: string;
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  cacheState?: CacheState;
  upstreamProvider?: "openrouteservice";
  upstreamStatus?: number;
  appVersion: string;
  errorCode?: string;
  areaClassification?: "inside" | "outside" | "unknown";
};

export type StructuredLogRecord = Required<
  Pick<
    StructuredLogInput,
    "timestamp" | "level" | "event" | "requestId" | "route" | "method" | "status" | "durationMs" | "appVersion"
  >
> &
  Pick<
    StructuredLogInput,
    "cacheState" | "upstreamProvider" | "upstreamStatus" | "errorCode" | "areaClassification"
  >;

export type LogSink = (serializedRecord: string, level: LogLevel) => void;

const defaultSink: LogSink = (serializedRecord, level) => {
  if (level === "error") console.error(serializedRecord);
  else if (level === "warn") console.warn(serializedRecord);
  else console.info(serializedRecord);
};

const finiteNonNegative = (value: number) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const safeToken = (value: string, fallback: string, maxLength = 128) =>
  /^[A-Za-z0-9._:/-]+$/.test(value) ? value.slice(0, maxLength) : fallback;

/**
 * Only the explicitly listed operational fields are serialized. Request bodies,
 * headers, free text, exact coordinates and arbitrary error objects have no path
 * into the emitted record.
 */
export function createStructuredLogger(sink: LogSink = defaultSink, now: () => string = () => new Date().toISOString()) {
  return {
    log(input: StructuredLogInput): StructuredLogRecord {
      const record: StructuredLogRecord = {
        timestamp: input.timestamp && Number.isFinite(Date.parse(input.timestamp)) ? new Date(input.timestamp).toISOString() : now(),
        level: input.level,
        event: safeToken(input.event, "worker.event"),
        requestId: safeToken(input.requestId, "unknown"),
        route: safeToken(input.route, "/unknown"),
        method: safeToken(input.method.toUpperCase(), "UNKNOWN", 16),
        status: Number.isInteger(input.status) ? input.status : 500,
        durationMs: finiteNonNegative(input.durationMs),
        appVersion: safeToken(input.appVersion, "unknown"),
      };
      if (input.cacheState) record.cacheState = input.cacheState;
      if (input.upstreamProvider) record.upstreamProvider = input.upstreamProvider;
      if (Number.isInteger(input.upstreamStatus)) record.upstreamStatus = input.upstreamStatus;
      if (input.errorCode) record.errorCode = safeToken(input.errorCode, "INTERNAL_ERROR");
      if (input.areaClassification) record.areaClassification = input.areaClassification;
      sink(JSON.stringify(record), input.level);
      return record;
    },
  };
}

export type StructuredLogger = ReturnType<typeof createStructuredLogger>;

