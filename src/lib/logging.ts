import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { RouterConfig } from "./types";

const keysExcept = (r: Record<string, unknown>, ignore?: string[]) =>
  ((ignore || []).length
    ? Object.keys(r).filter(
        (h) => !ignore?.find((igh) => igh.toLowerCase() === h.toLowerCase())
      )
    : Object.keys(r)
  ).reduce((p, n) => ({ ...p, [n]: r[n] }), {});

export const logRequestResponse = (
  event: APIGatewayProxyEvent | APIGatewayProxyResult,
  config?: RouterConfig
) => {
  const { logConfig } = config || {};
  const logger = logConfig?.logger || (config || {}).logger;
  if (logger && logConfig?.logRequests) {
    const { body, headers, multiValueHeaders, ...rest } = event;
    const headersToLog = headers  ? keysExcept(headers, logConfig.ignoredHeaders) : {};
    const mvHeadersToLog = multiValueHeaders
      ? keysExcept(multiValueHeaders, logConfig.ignoredHeaders)
      : {};
    const bodyToLog = logConfig.logRequestBody ? body : undefined;
    const objectToLog = {
      ...rest,
      ...(bodyToLog ? { body: bodyToLog } : undefined),
      headers: headersToLog,
      multiValueHeaders: mvHeadersToLog,
    };
    logger.info("Request received", objectToLog);
  }
};