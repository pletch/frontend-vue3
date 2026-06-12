# OwnTracks Frontend

![Version](https://img.shields.io/github/package-json/v/owntracks/frontend)
[![Build](https://github.com/owntracks/frontend/workflows/Build/badge.svg)](https://github.com/owntracks/frontend/actions?query=workflow%3ABuild+branch%3Amain)
[![Tests](https://github.com/owntracks/frontend/workflows/Tests/badge.svg)](https://github.com/owntracks/frontend/actions?query=workflow%3ATests+branch%3Amain)
[![Lint](https://github.com/owntracks/frontend/workflows/Lint/badge.svg)](https://github.com/owntracks/frontend/actions?query=workflow%3ALint+branch%3Amain)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![License](https://img.shields.io/github/license/owntracks/frontend?color=d63e97)](https://github.com/owntracks/frontend/blob/main/LICENSE)

![Screenshot](https://raw.githubusercontent.com/owntracks/frontend/main/docs/images/screenshot.png)

## Introduction

This is an **unofficial fork** of the web interface for [OwnTracks](https://github.com/owntracks/recorder) built as
a Vue 3 single page application. The recorder itself already ships with some basic web
pages, this is a more advanced interface with more functionality, all in one place.

This fork introduces several major architectural improvements and features over the upstream repository:
- Complete migration to Vue 3 Composition API and Pinia state management.
- UI styling powered by Tailwind CSS.
- High-performance native WebGL hardware acceleration via MapLibre GL JS (replacing Leaflet).
- Route playback animation with dynamic activity states and velocity tracking.
- Dynamic reverse-geocoding via Photon API for missing addresses.
- Enhanced map markers with dynamic user activity glyphs and battery charging indicators.

![Map features](https://raw.githubusercontent.com/owntracks/frontend/main/docs/images/map-features.png)

## Features

- Last known (i.e. live) locations:
  - Accuracy visualization (circle)
  - Device friendly name and icon
  - Detailed information (if available): time, latitude, longitude, height, battery,
    speed and regions
- Location history (data points, line or both)
- Location heatmap
- Quickly fit all shown objects on the map into view
- Display data in a specific date and time range
- Filter by user or specific device
- Route playback animation with dynamic activity states and velocity tracking
- High-performance native WebGL hardware acceleration via MapLibre GL JS
- Automatic live WebSocket location injection for real-time tracking without API reloads
- Calculation of distance travelled
- Highly customisable

## Installation

> [!NOTE]
> A pre-built Docker image is **no longer available** for this fork. You must build the project manually using `npm` and deploy the contents of the `dist/` directory.

### Manual Build

- Run `npm install` to install dependencies
- Run `npm run build` to compile and minify for production
- Copy the content of the `dist/` directory to your webroot

## Configuration

It's possible to get started without any configuration change whatsoever, assuming your
OwnTracks API is reachable at the root of the same host as the frontend.

Copy [`public/config/config.example.js`](public/config/config.example.js) to
`public/config/config.js` and make changes as you wish.

See [`docs/config.md`](docs/config.md) for all available options.

## Development

- Run `npm install` to install dependencies
- Run `npm run dev` to compile for development and start the hot-reload server
- Run `npm run lint:js` to lint JavaScript/Vue files
- Run `npm run lint:md` to lint Markdown files
- Run `npm run format:js` to format JavaScript/Vue files
- Run `npm run format:md` to format Markdown files
- Run `npm test` to run unit tests

### CORS-Proxy

You can use the [`corsProxy.js`](scripts/corsProxy.js) script to use your production
instance of OwnTracks for development without making changes to its CORS-Headers:

```console
$ npm run cors-proxy
```

If you have [basic authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication#Basic_authentication_scheme)
enabled, create a `.env` file with your credentials:

```text
OT_BASIC_AUTH_USERNAME=user
OT_BASIC_AUTH_PASSWORD='P@$$w0rd'
```

Then run:

```console
$ env $(cat .env | xargs) npm run cors-proxy
```

The default host and port it binds to is `0.0.0.0:8888`. Change using the `OT_PROXY_HOST`
and `OT_PROXY_PORT` environment variables.

Finally update `api.baseUrl` in your config to `"http://0.0.0.0:8888/https://owntracks.example.com"`.

### I18n

This project uses [Vue I18n](https://vue-i18n.intlify.dev/) for robust localization.

To add a new locale, copy `en-US.json` to `<locale>.json` in [`src/locales`](src/locales)
and start translating the individual strings. Make sure to [mention the new locale to the docs](docs/config.md#locale)!

For a specific example see commit [`b2edda4`](https://github.com/owntracks/frontend/commit/b2edda410f16633aa6fd9cd4e5250f2031536c7d)
where German translations were added.

## Contributing

Please feel free to open an issue and discuss your ideas and report bugs. If you think
you can help out with something, open a PR!
