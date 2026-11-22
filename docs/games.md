# Game templates

A game in hako is one JSON file. Built-in templates are in `apps/api/src/games/builtin/`. To add your own, put a `.json` file into `GAMES_DIR` (by default `DATA_DIR/games`, `/srv/hako/games` in the compose file) and restart hako. A broken file is skipped and the reason is printed to the log.

Most games already have a community Docker image that installs and runs the server. A template only describes how to run that image, so check the image documentation for its environment variables, arguments and data folder.

## Example

```json
{
  "id": "terraria",
  "name": "Terraria",
  "description": { "ru": "Ванильный сервер Terraria", "en": "Vanilla Terraria server" },
  "image": "ryshe/terraria:{{VERSION}}",
  "command": ["-world", "/root/.local/share/Terraria/Worlds/{{WORLD}}.wld", "-autocreate", "{{SIZE}}"],
  "dataPath": "/root/.local/share/Terraria/Worlds",
  "ports": [{ "name": "game", "container": 7777, "protocol": "tcp" }],
  "memory": { "default": 1024, "min": 512 },
  "stop": { "command": "exit", "timeout": 30 },
  "variables": [
    { "key": "VERSION", "name": { "ru": "Версия", "en": "Version" }, "type": "select", "default": "latest", "options": [{ "value": "latest" }] },
    { "key": "WORLD", "name": { "ru": "Мир", "en": "World" }, "default": "world", "pattern": "^[a-zA-Z0-9_-]{1,32}$", "editable": false },
    { "key": "SIZE", "name": { "ru": "Размер", "en": "Size" }, "type": "select", "default": "2", "options": [{ "value": "1", "label": "Small" }, { "value": "2", "label": "Medium" }, { "value": "3", "label": "Large" }] }
  ]
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase id, `a-z`, `0-9` and `-`. A file with the id of a built-in template replaces it. |
| `name`, `description` | `name` | Text shown in the panel: a string or `{ "ru": "…", "en": "…" }`. |
| `icon` | no | Image URL or `data:` URI. An SVG `data:` URI is drawn as a one-colour shape in the current text colour; anything else is shown as is. Options of a `select` variable take an `icon` the same way. |
| `configs` | no | Config files edited on the "Configuration" tab. See below. |
| `groups` | no | Sections of the server settings tab and of the wizard's settings step: `{ "id", "name", "description", "collapsed" }`. `collapsed: true` folds the section in the wizard until it is opened; it opens by itself when it holds an unfilled required setting. A variable joins one with `group`; variables without a known group land in "Other". The startup preview is shown in the section of the first variable it uses. |
| `startup` | no | Preview of the startup command shown in the settings, for example `java {{JVM_FLAGS}} -Xmx{{SERVER_HEAP}}M -jar server.jar`. Select and boolean variables with a `preview` map show that text instead of their value. When the server runs, the settings can also show the real command taken from the container processes. |
| `image` | yes | Docker image. May contain `{{KEY}}`. |
| `command` | no | Arguments passed to the image instead of its default command. |
| `env` | no | Environment variables for the container. Values may contain `{{KEY}}`. |
| `dataPath` | no | Folder inside the container where the server keeps its files, `/data` by default. It is the folder the file manager shows. |
| `ports` | yes | `name`, `container` port and `protocol` (`tcp` or `udp`). The host port is picked when the server is created. |
| `memory` | no | `default` and `min` in MB. The container gets a hard limit with no swap. |
| `variables` | no | Settings the user fills in. See below. |
| `console.ready` | no | Regular expression. The status stays "starting" until a console line matches; without it the server counts as running right away. |
| `console.exec` | no | Command run inside the container to send console input, such as `["inject"]`, for images that do not read stdin. |
| `console.version` | no | Regular expression whose first group is the game version printed at startup. It is shown next to the game name. |
| `console.players` | no | `{ "join", "leave" }`: regular expressions whose first group is a player name. The overview shows who is online, rebuilt from the log after a panel restart. |
| `console.chat` | no | `{ "message", "command", "server", "say" }`: turns on the chat panel under the console. `message` and `command` are regular expressions with the player name in group 1 and the text in group 2, `server` has the text of a server message in group 1, `say` is the console command that sends a message with `{{MESSAGE}}`. Joins and leaves come from `console.players`, and the time from the first `HH:MM:SS` in the line. |
| `stop.command` | no | Console command that stops the server cleanly. Without it hako sends SIGTERM. |
| `stop.timeout` | no | Seconds to wait before the container is killed, 60 by default. |
| `players` | no | Player management for the "Players" section of the Configuration tab and the online list on the overview. `name` is a regular expression for valid names, `avatar` an image URL with `{{NAME}}` (letters are shown without it), `known` a JSON file of `{ name, uuid }` with everyone who joined (Minecraft's `usercache.json`), `kick` the console command that kicks a player. `lists` has `ops`, `whitelist` and `bans`, each `{ config, add, remove }`: `add` and `remove` are console commands with `{{NAME}}` used while the server runs; `config` is the path of a `players` or `list` config file that holds the list and is written directly while the server is offline. A list without `config` only works while the server runs. |
| `map` | no | World map mods the Map tab can turn on, one at a time: `{ "providers": [{ "id", "name", "description", "icon", "source", "project", "port", "render", "when", "files" }] }`. Turning one on installs `project` from the addon `source` (Modrinth by default), removes the previous map, gives the server a host port for `port` and stores the choice in the managed `MAP` variable. Before each start hako applies `files`: `{ path, when, create, replace }` creates a missing file or replaces text in it, for example BlueMap's `accept-download`. `render` is a console command for a full render; hako sends it by itself on the first start after a map is turned on (most map mods only draw chunks that change, not the existing world), and the Map tab has a button for it. The map is shown through the panel at `/api/servers/:id/map/` and, when sharing is on (`MAP_SHARE`), publicly at `/api/share/map/<token>/`. `MAP_HOST` (default `127.0.0.1`) is the host the panel uses to reach published ports. |
| `healthcheck` | no | `false` turns off the image's Docker healthcheck, for images whose check spams the console (Factorio's polls RCON every 30 seconds). |
| `addons` | no | Addon sources for this game: `{ "source": "modrinth", "params": { … } }`. |

## Variables

| Field | Meaning |
|---|---|
| `key` | Upper-case name, used as `{{KEY}}`. |
| `name`, `description` | Text in the form. |
| `type` | `string` (default), `number`, `boolean` or `select`. |
| `default` | Value used when the user leaves the field alone, always a string. |
| `options` | For `select`: `{ "value": "…", "label": "…", "description": "…", "icon": "…", "env": { … } }`. `env` is added to the container environment while that option is chosen, for example `{ "USE_AIKAR_FLAGS": "true" }` for a flag preset. Options with descriptions are shown as cards, up to four short options as tabs, the rest as a dropdown. An option can also carry `template` with any of `image`, `command`, `console`, `stop`, `configs` and `addons`: while it is chosen these replace the template's own, so one game can offer builds that run different images, like vanilla Terraria and tModLoader. |
| `source` | For `select`: load options from an external service instead of `options`. `{ "id": "…", "params": { … }, "search": true }`; `params` may contain `{{KEY}}` of other variables, and when that variable changes this one resets to its default. `search` shows a search field with results. |
| `when` | Show the variable only when other variables have one of the listed values: `{ "TYPE": ["MODRINTH"] }`. Hidden variables are saved as empty strings and skip validation. |
| `step` | `setup` puts the variable on the "Version" step of the new server wizard, `settings` (default) on the "Settings" step. `managed` hides it from every form: the panel writes it itself, for example the Workshop mod lists, and saving the settings keeps its value. |
| `required` | Must not be empty. A required `boolean` must be on, which is how EULAs are accepted. |
| `pattern` | Regular expression the value must match. |
| `link` | `{ "url", "text" }`. A `boolean` with a link is shown as "I agree to the <link>" with a switch, like the Minecraft EULA; while a required one is off, the row is tinted as a warning. On other types the link follows the description. |
| `preview` | Map from a value to the text it adds to the `startup` preview, for example `{ "true": "--add-modules=jdk.incubator.vector" }`. |
| `auto` | `{ "key", "rules": [{ "pattern", "value" }] }`. When the variable's value is `auto`, the server starts with the `value` of the first rule whose regular expression matches the value of variable `key`, or of the last rule when none match. Minecraft uses it to pick the Java image from `VERSION`. |
| `editable` | `false` locks the value after the server is created, for things like world names. |

A variable used inside `image` or `command` should be a `select` or have a strict `pattern`, so a user cannot point the server at any image. Values from a `source` are always limited to letters, digits and `_ . + -`.

`{{#KEY}}…{{/KEY}}` keeps the text inside only when `KEY` is set and not `false`, which is how optional arguments are built: `"SERVER_ARGS": "-preset {{PRESET}}{{#COMBAT}} -modifier combat {{COMBAT}}{{/COMBAT}}"`. A `select` option may have an empty `value` for "not set".

An environment variable whose value is just `{{KEY}}` is left out of the container when that variable is empty or hidden, so the image uses its own default. Write a literal value (for example `"MEMORY": ""`) when you need an empty variable to be passed.

Built-in keys available everywhere: `SERVER_ID`, `SERVER_NAME`, `SERVER_MEMORY` (MB), `SERVER_HEAP` (MB, the memory minus 15% or at least 512 MB left for the JVM itself), `SERVER_PORT` (host port of the first port), `SERVER_PORT_<NAME>` for each port, `SERVER_ICON` (the server avatar as a path inside the container, or an https URL; empty if none) and `HAKO_CURSEFORGE_API_KEY` (the panel's `CURSEFORGE_API_KEY`).

## Config files

```json
"configs": [
  {
    "path": "server.properties",
    "format": "properties",
    "name": "server.properties",
    "fields": [
      { "key": "max-players", "name": { "ru": "Максимум игроков", "en": "Max players" }, "type": "number" },
      { "key": "pvp", "name": "PvP", "type": "boolean" }
    ]
  }
]
```

`path` is relative to the server folder. `groups` (`id`, `name`, `description`) split the tab into sections, and a field joins one with `group`; fields without a known group land in "Other". Keys of the file that have no field are listed, collapsed, under "All file options". `defaults` is the full file a fresh server would get; until the server creates the file, the tab shows it and saving writes it with your changes. With `seed: true` hako writes `defaults` into the server folder before the first start, so an image that only creates a missing file starts from hako's version instead of its own. `fields` get proper controls (`string`, `number`, `boolean`, `select` with `options`, and `motd` for a Minecraft MOTD editor with § colour codes and a server list preview); every other key in the file is listed below them as plain text. Saving rewrites only the changed lines and keeps comments. The tab shows a hint until the server creates the file on its first start. `format` is `properties` (Java-style `key=value`), `json`, `bepinex`, `list` or `players`. `players` is for Minecraft's `ops.json`, `whitelist.json` and `banned-players.json`, chosen with `list` (`ops`, `whitelist`, `bans`): while the server runs, adding or removing a player goes through the console (`op`, `whitelist add`, `ban` and their opposites), otherwise the file is written with the UUID from the Mojang API, or the offline UUID when `online-mode=false`. With `json`, field keys are dotted paths such as `visibility.public`, keys starting with `_` are treated as comments and hidden, and saving keeps each value's JSON type. With `bepinex`, `path` is a folder: the tab lists its `.cfg` files and builds the form from the BepInEx comments in each file (description, setting type, default value, acceptable values and ranges). With `list`, the file holds one id per line with `//` comments kept, or a JSON array when the path ends in `.json` (objects with `username` are kept as they are); the tab shows it as a list of players with an add field, `description` above it and `placeholder` in the field.

Settings that live in a config file should not also be template variables passed as environment variables, because images like `itzg/minecraft-server` rewrite the file from the environment on every start.

## Option sources

| Source | Params | Gives |
|---|---|---|
| `minecraft-versions` | `snapshots`, `betas`: `true` to include snapshots or old beta versions | `LATEST` and Minecraft releases, from Modrinth |
| `modrinth-modpacks` | | Modpack slugs from Modrinth search, use with `search: true` |
| `modrinth-versions` | `project`: slug or id | Versions of a Modrinth project, empty value means the latest |
| `curseforge-modpacks` | | Modpack slugs from CurseForge search, needs `CURSEFORGE_API_KEY` |
| `curseforge-files` | `project`: slug | Files of a CurseForge modpack, empty value means the latest |

New sources go into `SOURCES` in `apps/api/src/options/index.ts`.

## Addon sources

| Source | Params |
|---|---|
| `modrinth` | `loader`: Minecraft server type (`fabric`, `quilt`, `forge`, `neoforge`, `paper`, `purpur`, `folia`); `gameVersion`: Minecraft version or `LATEST`. |
| `curseforge` | Same params as `modrinth` (`folia` is not supported). Needs the CurseForge API key from Admin → Providers; without it the source shows as disabled. Files installed through hako are remembered in `DATA_DIR/curseforge-files.json`, which is how they are recognised and checked for updates later. |
| `thunderstore` | `community`: Thunderstore community, for example `valheim`; `dir`, `disabled`, `patchers`, `config`: BepInEx folders inside the server folder; `skip`: comma-separated packages that are never installed, such as the BepInEx pack the image already ships. Packages are unpacked the way r2modman does it, dependencies included, and turned off by moving them to `disabled`. |
| `workshop` | `appId`: Steam app id; `all` and `enabled`: `managed` variables that hold comma-separated Workshop ids, passed to the image so it downloads and enables them; `enabledFile`: file deleted when no mod is enabled, so the image does not keep an old list. Search needs no Steam API key. |

New sources are TypeScript modules in `apps/api/src/addons/` that implement `AddonSource`.
