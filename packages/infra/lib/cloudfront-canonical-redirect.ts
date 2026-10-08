/**
 * CloudFront Function (JS 2.0) viewer-request source.
 * www → apex 301 happens before any URI rewrite. Location is a literal host.
 */
export const canonicalRedirectFunctionCode = `function handler(event) {
  var request = event.request;
  var hostHeader = request.headers && request.headers.host;
  var host = hostHeader && hostHeader.value ? String(hostHeader.value).toLowerCase() : '';
  if (host === 'www.galaxyclass.app') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://galaxyclass.app' + request.uri + querySuffix(request.querystring) }
      }
    };
  }
  var game = gameRoot(request.uri);
  if (game) {
    if (!hasFileExtension(request.uri)) {
      request.uri = game + '/index.html';
    }
    return request;
  }
  if (request.uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!hasFileExtension(request.uri)) {
    request.uri += '.html';
  }
  return request;
}
function gameRoot(uri) {
  var roots = ['/riffle', '/scribble', '/warships', '/whodunit'];
  for (var i = 0; i < roots.length; i++) {
    if (uri === roots[i] || uri.indexOf(roots[i] + '/') === 0) {
      return roots[i];
    }
  }
  return null;
}
function hasFileExtension(uri) {
  var segment = uri.split('/').pop();
  var dot = segment.lastIndexOf('.');
  return dot > 0;
}
function querySuffix(querystring) {
  if (!querystring) return '';
  var keys = Object.keys(querystring);
  if (keys.length === 0) return '';
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var entry = querystring[key];
    if (entry.multiValue && entry.multiValue.length) {
      for (var j = 0; j < entry.multiValue.length; j++) {
        parts.push(key + '=' + entry.multiValue[j].value);
      }
    } else if (entry.value != null && entry.value !== '') {
      parts.push(key + '=' + entry.value);
    } else if (entry.value === '') {
      parts.push(key + '=');
    }
  }
  return '?' + parts.join('&');
}
`;

export interface ViewerRequestEvent {
  request: {
    uri: string;
    headers: { host?: { value: string } };
    querystring?: Record<string, { value?: string; multiValue?: Array<{ value: string }> }>;
  };
}

/** Execute the viewer-request function against a synthetic CloudFront event. */
export function runViewerRequest(event: ViewerRequestEvent): unknown {
  const load = new Function(`${canonicalRedirectFunctionCode}\nreturn handler;`) as () => (
    event: ViewerRequestEvent,
  ) => unknown;
  return load()(event);
}
