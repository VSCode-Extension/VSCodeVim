<h2 align="center"><img src="https://raw.githubusercontent.com/VSCodeVim/Vim/master/images/icon.png" height="128"><br>VSCodeVim</h2>
<p align="center"><strong>Vim emulation for Visual Studio Code</strong></p>

<!-- TODO: use pgns or something; otherwise vsce won't package it
[![](https://vsmarketplacebadge.apphb.com/version/vscodevim.vim.svg)](http://aka.ms/vscodevim)
[![](https://vsmarketplacebadge.apphb.com/installs-short/vscodevim.vim.svg)](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim)
[![](https://github.com/VSCodeVim/Vim/workflows/build/badge.svg?branch=master)](https://github.com/VSCodeVim/Vim/actions?query=workflow%3Abuild+branch%3Amaster)
-->

VSCodeVim is a Vim emulator for [Visual Studio Code](https://code.visualstudio.com/).

- 🚚 For a full list of supported Vim features, please refer to our [roadmap](ROADMAP.md).
- 📃 Our [change log](CHANGELOG.md) outlines the breaking/major/minor updates between releases.
- Report missing features/bugs on [GitHub](https://github.com/VSCodeVim/Vim/issues).

<details>
 <summary><strong>Table of Contents</strong> (click to expand)</summary>

- [💾 Installation](#-installation)
  - [Mac](#mac)
  - [Windows](#windows)
- [⚙️ Settings](#️-settings)
  - [Quick Example](#quick-example)
  - [VSCodeVim settings](#vscodevim-settings)
  - [Neovim Integration](#neovim-integration)
  - [Key Remapping](#key-remapping)
    - [`"vim.insertModeKeyBindings"`/`"vim.normalModeKeyBindings"`/`"vim.visualModeKeyBindings"`/`"vim.operatorPendingModeKeyBindings"`](#viminsertmodekeybindingsvimnormalmodekeybindingsvimvisualmodekeybindingsvimoperatorpendingmodekeybindings)
    - [`"vim.insertModeKeyBindingsNonRecursive"`/`"normalModeKeyBindingsNonRecursive"`/`"visualModeKeyBindingsNonRecursive"`/`"operatorPendingModeKeyBindingsNonRecursive"`](#viminsertmodekeybindingsnonrecursivenormalmodekeybindingsnonrecursivevisualmodekeybindingsnonrecursiveoperatorpendingmodekeybindingsnonrecursive)
    - [Debugging Remappings](#debugging-remappings)
    - [Remapping more complex key combinations](#remapping-more-complex-key-combinations)
  - [Vim modes](#vim-modes)
  - [Vim settings](#vim-settings)
- [.vimrc support](#vimrc-support)
- [🖱️ Multi-Cursor Mode](#️-multi-cursor-mode)
- [🔌 Emulated Plugins](#-emulated-plugins)
  - [vim-airline](#vim-airline)
  - [vim-easymotion](#vim-easymotion)
  - [vim-surround](#vim-surround)
  - [vim-commentary](#vim-commentary)
  - [vim-indent-object](#vim-indent-object)
  - [vim-sneak](#vim-sneak)
  - [CamelCaseMotion](#camelcasemotion)
  - [Input Method](#input-method)
  - [ReplaceWithRegister](#replacewithregister)
  - [vim-textobj-entire](#vim-textobj-entire)
  - [vim-textobj-arguments](#vim-textobj-arguments)
- [🎩 VSCodeVim tricks!](#-vscodevim-tricks)
- [📚 F.A.Q.](#-faq)
- [❤️ Contributing](#️-contributing)
  - [Special shoutouts to:](#special-shoutouts-to)

</details>

## 💾 Installation

VSCodeVim can be installed via the VS Code [Marketplace](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim).

### Mac

To enable key-repeating, execute the following in your Terminal, log out and back in, and then restart VS Code:

```sh
defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false              # For VS Code
defaults write com.microsoft.VSCodeInsiders ApplePressAndHoldEnabled -bool false      # For VS Code Insider
defaults write com.vscodium ApplePressAndHoldEnabled -bool false                      # For VS Codium
defaults write com.microsoft.VSCodeExploration ApplePressAndHoldEnabled -bool false   # For VS Codium Exploration users
defaults delete -g ApplePressAndHoldEnabled                                           # If necessary, reset global default
```

We also recommend increasing Key Repeat and Delay Until Repeat settings in _System Preferences -> Keyboard_.

### Windows

Like real vim, VSCodeVim will take over your control keys. This behavior can be adjusted with the [`useCtrlKeys`](#vscodevim-settings) and [`handleKeys`](#vscodevim-settings) settings.

## ⚙️ Settings

The settings documented here are a subset of the supported settings; the full list is described in the `Contributions` tab of VSCodeVim's [extension details page](https://code.visualstudio.com/docs/editor/extension-gallery#_extension-details), which can be found in the [extensions view](https://code.visualstudio.com/docs/editor/extension-gallery) of VS Code.

### Quick Example

Below is an example of a [settings.json](https://code.visualstudio.com/Docs/customization/userandworkspace) file with settings relevant to VSCodeVim:

```json
{
  "vim.easymotion": true,
  "vim.incsearch": true,
  "vim.useSystemClipboard": true,
  "vim.useCtrlKeys": true,
  "vim.hlsearch": true,
  "vim.insertModeKeyBindings": [
    {
      "before": ["j", "j"],
      "after": ["<Esc>"]
    }
  ],
  "vim.normalModeKeyBindingsNonRecursive": [
    {
      "before": ["<leader>", "d"],
      "after": ["d", "d"]
    },
    {
      "before": ["<C-n>"],
      "commands": [":nohl"]
    },
    {
      "before": ["K"],
      "commands": ["lineBreakInsert"],
      "silent": true
    }
  ],
  "vim.leader": "<space>",
  "vim.handleKeys": {
    "<C-a>": false,
    "<C-f>": false
  },

  "// To improve performance",
  "extensions.experimental.affinity": {
    "vscodevim.vim": 1
  }
}
```

### VSCodeVim settings

These settings are specific to VSCodeVim.

| Setting                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                        | Type    | Default Value                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------- |
| vim.changeWordIncludesWhitespace | Include trailing whitespace when changing word. This configures the <kbd>cw</kbd> action to act consistently as its siblings (<kbd>yw</kbd> and <kbd>dw</kbd>) instead of acting as <kbd>ce</kbd>.                                                                                                                                                                                                                                 | Boolean | false                                                         |
| vim.cursorStylePerMode._{Mode}_  | Configure a specific cursor style for _{Mode}_. Omitted modes will use [default cursor type](https://github.com/VSCodeVim/Vim/blob/4a6fde6dbd4d1fac1f204c0dc27c32883651ef1a/src/mode/mode.ts#L34) Supported cursors: line, block, underline, line-thin, block-outline, and underline-thin.                                                                                                                                         | String  | None                                                          |
| vim.digraphs._{shorthand}_       | Set custom digraph shorthands that can override the default ones. Entries should map a two-character shorthand to a descriptive string and one or more UTF16 code points. Example: `"R!": ["🚀", [55357, 56960]]`                                                                                                                                                                                                                  | Object  | `{"R!": ["🚀", [0xD83D, 0xDE80]]`                             |
| vim.disableExtension             | Disable VSCodeVim extension. This setting can also be toggled using `toggleVim` command in the Command Palette                                                                                                                                                                                                                                                                                                                     | Boolean | false                                                         |
| vim.handleKeys                   | Delegate configured keys to be handled by VS Code instead of by the VSCodeVim extension. Any key in `keybindings` section of the [package.json](https://github.com/VSCodeVim/Vim/blob/master/package.json) that has a `vim.use<C-...>` in the `when` argument can be delegated back to VS Code by setting `"<C-...>": false`. Example: to use `ctrl+f` for find (native VS Code behavior): `"vim.handleKeys": { "<C-f>": false }`. | String  | `"<C-d>": true`<br /> `"<C-s>": false`<br /> `"<C-z>": false` |
| vim.overrideCopy                 | Override VS Code's copy command with our own, which works correctly with VSCodeVim. If cmd-c/ctrl-c is giving you issues, set this to false and complain [here](https://github.com/Microsoft/vscode/issues/217).                                                                                                                                                                                                                   | Boolean | false                                                         |
| vim.useSystemClipboard           | Use the system clipboard register (`*`) as the default register                                                                                                                                                                                                                                                                                                                                                                    | Boolean | false                                                         |
| vim.searchHighlightColor         | Background color of non-current search matches                                                                                                                                                                                                                                                                                                                                                                                     | String  | `findMatchHighlightBackground` ThemeColor                     |
| vim.searchHighlightTextColor     | Foreground color of non-current search matches                                                                                                                                                                                                                                                                                                                                                                                     | String  | None                                                          |
| vim.searchMatchColor             | Background color of current search match                                                                                                                                                                                                                                                                                                                                                                                           | String  | `findMatchBackground` ThemeColor                              |
| vim.searchMatchTextColor         | Foreground color of current search match                                                                                                                                                                                                                                                                                                                                                                                           | String  | None                                                          |
| vim.substitutionColor            | Background color of substitution text when `vim.inccommand` is enabled                                                                                                                                                                                                                                                                                                                                                             | String  | "#50f01080"                                                   |
| vim.substitutionTextColor        | Foreground color of substitution text when `vim.inccommand` is enabled                                                                                                                                                                                                                                                                                                                                                             | String  | None                                                          |
| vim.startInInsertMode            | Start in Insert mode instead of Normal Mode                                                                                                                                                                                                                                                                                                                                                                                        | Boolean | false                                                         |
| vim.useCtrlKeys                  | Enable Vim ctrl keys overriding common VS Code operations such as copy, paste, find, etc.                                                                                                                                                                                                                                                                                                                                          | Boolean | true                                                          |
| vim.visualstar                   | In visual mode, start a search with `*` or `#` using the current selection                                                                                                                                                                                                                                                                                                                                                         | Boolean | false                                                         |
| vim.highlightedyank.enable       | Enable highlighting when yanking                                                                                                                                                                                                                                                                                                                                                                                                   | Boolean | false                                                         |
| vim.highlightedyank.color        | Set the color of yank highlights                                                                                                                                                                                                                                                                                                                                                                                                   | String  | rgba(250, 240, 170, 0.5)                                      |
| vim.highlightedyank.duration     | Set the duration of yank highlights                                                                                                                                                                                                                                                                                                                                                                                                | Number  | 200                                                           |

### Neovim Integration

> :warning: Experimental feature. Please leave feedback on neovim integration [here](https://github.com/VSCodeVim/Vim/issues/1735).

To leverage neovim for Ex-commands,

1.  Install [neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim)
2.  Modify the following configurations:

| Setting                 | Description                                                                                                                                            | Type    | Default Value |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------- |
| vim.enableNeovim        | Enable Neovim                                                                                                                                          | Boolean | false         |
| vim.neovimPath          | Full path to neovim executable. If left empty, PATH environment variable will be automatically checked for neovim path.                                | String  |               |
| vim.neovimUseConfigFile | If `true`, Neovim will load a config file specified by `vim.neovimConfigPath`. This is necessary if you want Neovim to be able to use its own plugins. | Boolean | false         |
| vim.neovimConfigPath    | Path that Neovim will load as config file. If left blank, Neovim will search in its default location.                                                  | String  |               |

Here's some ideas on what you can do with neovim integration:

- [The power of g](http://vim.wikia.com/wiki/Power_of_g)
- [The :normal command](https://vi.stackexchange.com/questions/4418/execute-normal-command-over-range)
- Faster search and replace!

### Key Remapping

Custom remappings are defined on a per-mode basis.

#### `"vim.insertModeKeyBindings"`/`"vim.normalModeKeyBindings"`/`"vim.visualModeKeyBindings"`/`"vim.operatorPendingModeKeyBindings"`

- Keybinding overrides to use for insert, normal, operatorPending and visual modes.
- Keybinding overrides can include `"before"`, `"after"`, `"commands"`, and `"silent"`.
- Bind `jj` to `<Esc>` in insert mode:

```json
    "vim.insertModeKeyBindings": [
        {
            "before": ["j", "j"],
            "after": ["<Esc>"]
        }
    ]
```

- Bind `£` to goto previous whole word under cursor:

```json
    "vim.normalModeKeyBindings": [
        {
            "before": ["£"],
            "after": ["#"]
        }
    ]
```

- Bind `:` to show the command palette, and don't show the message on the status bar:

```json
    "vim.normalModeKeyBindings": [
        {
            "before": [":"],
            "commands": [
                "workbench.action.showCommands",
            ],
            "silent": true
        }
    ]
```

- Bind `<leader>m` to add a bookmark and `<leader>b` to open the list of all bookmarks (using the [Bookmarks](https://marketplace.visualstudio.com/items?itemName=alefragnani.Bookmarks) extension):

```json
    "vim.normalModeKeyBindings": [
        {
            "before": ["<leader>", "m"],
            "commands": [
                "bookmarks.toggle"
            ]
        },
        {
            "before": ["<leader>", "b"],
            "commands": [
                "bookmarks.list"
            ]
        }
    ]
```

- Bind `ctrl+n` to turn off search highlighting and `<leader>w` to save the current file:

```json
    "vim.normalModeKeyBindings": [
        {
            "before":["<C-n>"],
            "commands": [
                ":nohl",
            ]
        },
        {
            "before": ["leader", "w"],
            "commands": [
                "workbench.action.files.save",
            ]
        }
    ]
```

- Bind `{` to `w` in operator pending mode makes `y{` and `d{` work like `yw` and `dw` respectively:

```json
    "vim.operatorPendingModeKeyBindings": [
        {
            "before": ["{"],
            "after": ["w"]
        }
    ]
```

- Bind `L` to `$` and `H` to `^` in operator pending mode makes `yL` and `dH` work like `y$` and `d^` respectively:

```json
    "vim.operatorPendingModeKeyBindings": [
        {
            "before": ["L"],
            "after": ["$"]
        },
        {
            "before": ["H"],
            "after": ["^"]
        }
    ]
```

- Bind `>` and `<` in visual mode to indent/outdent lines (repeatable):

```json
    "vim.visualModeKeyBindings": [
        {
            "before": [
                ">"
            ],
            "commands": [
                "editor.action.indentLines"
            ]
        },
        {
            "before": [
                "<"
            ],
            "commands": [
                "editor.action.outdentLines"
            ]
        },
    ]
```

- Bind `<leader>vim` to clone this repository to the selected location:

```json
    "vim.visualModeKeyBindings": [
        {
            "before": [
                "<leader>", "v", "i", "m"
            ],
            "commands": [
                {
                    "command": "git.clone",
                    "args": [ "https://github.com/VSCodeVim/Vim.git" ]
                }
            ]
        }
    ]
```

#### `"vim.insertModeKeyBindingsNonRecursive"`/`"normalModeKeyBindingsNonRecursive"`/`"visualModeKeyBindingsNonRecursive"`/`"operatorPendingModeKeyBindingsNonRecursive"`

- Non-recursive keybinding overrides to use for insert, normal, and visual modes
- _Example:_ Exchange the meaning of two keys like `j` to `k` and `k` to `j` to exchange the cursor up and down commands. Notice that if you attempted this binding normally, the `j` would be replaced with `k` and the `k` would be replaced with `j`, on and on forever. When this happens 'maxmapdepth' times (default 1000) the error message 'E223 Recursive Mapping' will be thrown. Stop this recursive expansion using the NonRecursive variation of the keybindings:

```json
    "vim.normalModeKeyBindingsNonRecursive": [
        {
            "before": ["j"],
            "after": ["k"]
        },
        {
            "before": ["k"],
            "after": ["j"]
        }
    ]
```

- Bind `(` to 'i(' in operator pending mode makes 'y(' and 'c(' work like 'yi(' and 'ci(' respectively:

```json
    "vim.operatorPendingModeKeyBindingsNonRecursive": [
        {
            "before": ["("],
            "after": ["i("]
        }
    ]
```

- Bind `p` in visual mode to paste without overriding the current register:

```json
    "vim.visualModeKeyBindingsNonRecursive": [
        {
            "before": [
                "p",
            ],
            "after": [
                "p",
                "g",
                "v",
                "y"
            ]
        }
    ],
```

#### Debugging Remappings

1.  Adjust the extension's logging level to 'debug' and open the Output window:
    1.  Run `Developer: Set Log Level` from the command palette.
    2.  Select `Vim`, then `Debug`
    3.  Run `Developer: Reload window`
    4.  In the bottom panel, open the `Output` tab and select `Vim` from the dropdown selection.
2.  Are your configurations correct?

    As each remapped configuration is loaded, it is logged to the Vim Output panel. Do you see any errors?

    ```console
    debug: Remapper: normalModeKeyBindingsNonRecursive. before=0. after=^.
    debug: Remapper: insertModeKeyBindings. before=j,j. after=<Esc>.
    error: Remapper: insertModeKeyBindings. Invalid configuration. Missing 'after' key or 'commands'. before=j,k.
    ```

    Misconfigured configurations are ignored.

3.  Does the extension handle the keys you are trying to remap?

    VSCodeVim explicitly instructs VS Code which key events we care about through the [package.json](https://github.com/VSCodeVim/Vim/blob/9bab33c75d0a53873880a79c5d2de41c8be1bef9/package.json#L62). If the key you are trying to remap is a key in which vim/vscodevim generally does not handle, then it's most likely that this extension does not receive those key events from VS Code. In the Vim Output panel, you should see:

    ```console
    debug: ModeHandler: handling key=A.
    debug: ModeHandler: handling key=l.
    debug: ModeHandler: handling key=<BS>.
    debug: ModeHandler: handling key=<C-a>.
    ```

    As you press the key that you are trying to remap, do you see it outputted here? If not, it means we don't subscribe to those key events. It is still possible to remap those keys by using VSCode's [keybindings.json](https://code.visualstudio.com/docs/getstarted/keybindings#_keyboard-shortcuts-reference) (see next section: [Remapping more complex key combinations](#remapping-more-complex-key-combinations)).

#### Remapping more complex key combinations

It is highly recommended to remap keys using vim commands like `"vim.normalModeKeyBindings"` ([see here](#key-remapping)). But sometimes the usual remapping commands are not enough as they do not support every key combinations possible (for example `Alt+key` or `Ctrl+Shift+key`). In this case it is possible to create new keybindings inside [keybindings.json](https://code.visualstudio.com/docs/getstarted/keybindings#_keyboard-shortcuts-reference). To do so: open up keybindings.json in VSCode using `CTRL+SHIFT+P` and select `Open keyboard shortcuts (JSON)`.

You can then add a new entry to the keybindings like so:

```json
{
  "key": "YOUR_KEY_COMBINATION",
  "command": "vim.remap",
  "when": "inputFocus && vim.mode == 'VIM_MODE_YOU_WANT_TO_REBIND'",
  "args": {
    "after": ["YOUR_VIM_ACTION"]
  }
}
```

For example, to rebind `ctrl+shift+y` to VSCodeVim's `yy` (yank line) in normal mode, add this to your keybindings.json:

```json
{
  "key": "ctrl+shift+y",
  "command": "vim.remap",
  "when": "inputFocus && vim.mode == 'Normal'",
  "args": {
    "after": ["y", "y"]
  }
}
```

If keybindings.json is empty the first time you open it, make sure to add opening `[` and closing `]` square brackets to the file as the keybindings should be inside a JSON Array.

### Vim modes

Here are all the modes used by VSCodeVim:

| Mode                  |
| --------------------- |
| Normal                |
| Insert                |
| Visual                |
| VisualBlock           |
| VisualLine            |
| SearchInProgressMode  |
| CommandlineInProgress |
| Replace               |
| EasyMotionMode        |
| EasyMotionInputMode   |
| SurroundInputMode     |
| OperatorPendingMode   |
| Disabled              |

When rebinding keys in [keybindings.json](https://code.visualstudio.com/docs/getstarted/keybindings) using ["when clause context"](https://code.visualstudio.com/api/references/when-clause-contexts), it can be useful to know in which mode vim currently is. For example to write a "when clause" that checks if vim is currently in normal mode or visual mode it is possible to write the following:

```json
"when": "vim.mode == 'Normal' || vim.mode == 'Visual'",
```

### Vim settings

Configuration settings that have been copied from vim. Vim settings are loaded in the following sequence:

1.  `:set {setting}`
2.  `vim.{setting}` from user/workspace settings.
3.  VS Code settings
4.  VSCodeVim default values

| Setting          | Description                                                                                                                                                                                                                                                   | Type    | Default Value                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| vim.autoindent   | Copy indent from current line when starting a new line                                                                                                                                                                                                        | Boolean | true                                                           |
| vim.gdefault     | When on, the `:substitute` flag `g` is default on. This means that all matches in a line are substituted instead of one. When a `g` flag is given to a `:substitute` command, this will toggle the substitution of all or one match.                          | Boolean | false                                                          |
| vim.hlsearch     | Highlights all text matching current search                                                                                                                                                                                                                   | Boolean | false                                                          |
| vim.ignorecase   | Ignore case in search patterns                                                                                                                                                                                                                                | Boolean | true                                                           |
| vim.incsearch    | Show the next match while entering a search                                                                                                                                                                                                                   | Boolean | true                                                           |
| vim.inccommand   | Show the effects of the `:substitute` command while typing                                                                                                                                                                                                    | String  | `replace`                                                      |
| vim.joinspaces   | Add two spaces after '.', '?', and '!' when joining or reformatting                                                                                                                                                                                           | Boolean | true                                                           |
| vim.leader       | Defines key for `<leader>` to be used in key remappings                                                                                                                                                                                                       | String  | `\`                                                            |
| vim.maxmapdepth  | Maximum number of times a mapping is done without resulting in a character to be used. This normally catches endless mappings, like ":map x y" with ":map y x". It still does not catch ":map g wg", because the 'w' is used before the next mapping is done. | Number  | 1000                                                           |
| vim.report       | Threshold for reporting number of lines changed.                                                                                                                                                                                                              | Number  | 2                                                              |
| vim.shell        | Path to the shell to use for `!` and `:!` commands.                                                                                                                                                                                                           | String  | `/bin/sh` on Unix, `%COMSPEC%` environment variable on Windows |
| vim.showcmd      | Show (partial) command in status bar                                                                                                                                                                                                                          | Boolean | true                                                           |
| vim.showmodename | Show name of current mode in status bar                                                                                                                                                                                                                       | Boolean | true                                                           |
| vim.smartcase    | Override the 'ignorecase' setting if search pattern contains uppercase characters                                                                                                                                                                             | Boolean | true                                                           |
| vim.textwidth    | Width to word-wrap when using `gq`                                                                                                                                                                                                                            | Number  | 80                                                             |
| vim.timeout      | Timeout in milliseconds for remapped commands                                                                                                                                                                                                                 | Number  | 1000                                                           |
| vim.whichwrap    | Allow specified keys that move the cursor left/right to move to the previous/next line when the cursor is on the first/last character in the line. See [:help whichwrap](https://vimhelp.org/options.txt.html#%27whichwrap%27).                               | String  | `b,s`                                                          |

## .vimrc support

> :warning: .vimrc support is currently experimental. Only remaps are supported, and you may experience bugs. Please [report them](https://github.com/VSCodeVim/Vim/issues/new?template=bug_report.md)!

Set `vim.vimrc.enable` to `true` and set `vim.vimrc.path` appropriately.

## 🖱️ Multi-Cursor Mode

> :warning: Multi-Cursor mode is experimental. Please report issues in our [feedback thread.](https://github.com/VSCodeVim/Vim/issues/824)

Enter multi-cursor mode by:

- On OSX, `cmd-d`. On Windows, `ctrl-d`.
- `gb`, a new shortcut we added which is equivalent to `cmd-d` (OSX) or `ctrl-d` (Windows). It adds another cursor at the next word that matches the word the cursor is currently on.
- Running "Add Cursor Above/Below" or the shortcut on any platform.

Once you have multiple cursors, you should be able to use Vim commands as you see fit. Most should work; some are unsupported (ref [PR#587](https://github.com/VSCodeVim/Vim/pull/587)).

- Each cursor has its own clipboard.
- Pressing Escape in Multi-Cursor Visual Mode will bring you to Multi-Cursor Normal mode. Pressing it again will return you to Normal mode.

## 🔌 Emulated Plugins

### vim-airline

> :warning: There are performance implications to using this plugin. In order to change the status bar, we override the configurations in your workspace settings.json which results in increased latency and a constant changing diff in your working directory (see [issue#2124](https://github.com/VSCodeVim/Vim/issues/2124)).

Change the color of the status bar based on the current mode. Once enabled, configure `"vim.statusBarColors"`. Colors can be defined for each mode either as `string` (background only), or `string[]` (background, foreground).

```json
    "vim.statusBarColorControl": true,
    "vim.statusBarColors.normal": ["#8FBCBB", "#434C5E"],
    "vim.statusBarColors.insert": "#BF616A",
    "vim.statusBarColors.visual": "#B48EAD",
    "vim.statusBarColors.visualline": "#B48EAD",
    "vim.statusBarColors.visualblock": "#A3BE8C",
    "vim.statusBarColors.replace": "#D08770",
    "vim.statusBarColors.commandlineinprogress": "#007ACC",
    "vim.statusBarColors.searchinprogressmode": "#007ACC",
    "vim.statusBarColors.easymotionmode": "#007ACC",
    "vim.statusBarColors.easymotioninputmode": "#007ACC",
    "vim.statusBarColors.surroundinputmode": "#007ACC",
```

### vim-easymotion

Based on [vim-easymotion](https://github.com/easymotion/vim-easymotion) and configured through the following settings:

| Setting                                          | Description                                                                                              | Type    | Default Value                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| vim.easymotion                                   | Enable/disable easymotion plugin                                                                         | Boolean | false                                              |
| vim.easymotionMarkerBackgroundColor              | The background color of the marker box.                                                                  | String  | '#0000'                                            |
| vim.easymotionMarkerForegroundColorOneChar       | The font color for one-character markers.                                                                | String  | '#ff0000'                                          |
| vim.easymotionMarkerForegroundColorTwoCharFirst  | The font color for the first of two-character markers, used to differentiate from one-character markers. | String  | '#ffb400'                                          |
| vim.easymotionMarkerForegroundColorTwoCharSecond | The font color for the second of two-character markers, used to differentiate consecutive markers.       | String  | '#b98300'                                          |
| vim.easymotionIncSearchForegroundColor           | The font color for the search n-character command, used to highlight the matches.                        | String  | '#7fbf00'                                          |
| vim.easymotionDimColor                           | The font color for the dimmed characters, used when `#vim.easymotionDimBackground#` is set to true.      | String  | '#777777'                                          |
| vim.easymotionDimBackground                      | Whether to dim other text while markers are visible.                                                     | Boolean | true                                               |
| vim.easymotionMarkerFontWeight                   | The font weight used for the marker text.                                                                | String  | 'bold'                                             |
| vim.easymotionKeys                               | The characters used for jump marker name                                                                 | String  | 'hklyuiopnm,qwertzxcvbasdgjf;'                     |
| vim.easymotionJumpToAnywhereRegex                | Custom regex to match for JumpToAnywhere motion (analogous to `Easymotion_re_anywhere`)                  | String  | `\b[A-Za-z0-9]\|[A-Za-z0-9]\b\|_.\|#.\|[a-z][A-Z]` |

Once easymotion is active, initiate motions using the following commands. After you initiate the motion, text decorators/markers will be displayed and you can press the keys displayed to jump to that position. `leader` is configurable and is `\` by default.

| Motion Command                      | Description                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `<leader><leader> s <char>`         | Search character                                                                                               |
| `<leader><leader> f <char>`         | Find character forwards                                                                                        |
| `<leader><leader> F <char>`         | Find character backwards                                                                                       |
| `<leader><leader> t <char>`         | Til character forwards                                                                                         |
| `<leader><leader> T <char>`         | Til character backwards                                                                                        |
| `<leader><leader> w`                | Start of word forwards                                                                                         |
| `<leader><leader> b`                | Start of word backwards                                                                                        |
| `<leader><leader> l`                | Matches beginning & ending of word, camelCase, after `_`, and after `#` forwards                               |
| `<leader><leader> h`                | Matches beginning & ending of word, camelCase, after `_`, and after `#` backwards                              |
| `<leader><leader> e`                | End of word forwards                                                                                           |
| `<leader><leader> ge`               | End of word backwards                                                                                          |
| `<leader><leader> j`                | Start of line forwards                                                                                         |
| `<leader><leader> k`                | Start of line backwards                                                                                        |
| `<leader><leader> / <char>... <CR>` | Search n-character                                                                                             |
| `<leader><leader><leader> bdt`      | Til character                                                                                                  |
| `<leader><leader><leader> bdw`      | Start of word                                                                                                  |
| `<leader><leader><leader> bde`      | End of word                                                                                                    |
| `<leader><leader><leader> bdjk`     | Start of line                                                                                                  |
| `<leader><leader><leader> j`        | JumpToAnywhere motion; default behavior matches beginning & ending of word, camelCase, after `_` and after `#` |
| `<leader><leader><leader> s`        | Search n-character and jump                                                                                    |
| `<leader><leader><leader> yr`       | Remote yank                                                                                                    |

`<leader><leader> (2s|2f|2F|2t|2T) <char><char>` and `<leader><leader><leader> bd2t <char>char>` are also available.
The difference is character count required for search.
For example, `<leader><leader> 2s <char><char>` requires two characters, and search by two characters.
This mapping is not a standard mapping, so it is recommended to use your custom mapping.

### vim-surround

Based on [surround.vim](https://github.com/tpope/vim-surround), the plugin is used to work with surrounding characters like parentheses, brackets, quotes, and XML tags.

| Setting      | Description                 | Type    | Default Value |
| ------------ | --------------------------- | ------- | ------------- |
| vim.surround | Enable/disable vim-surround | Boolean | true          |

`t` or `<` as `<desired>` or `<existing>` will enter tag entry mode. Using `<CR>` instead of `>` to finish changing a tag will preserve any existing attributes.

| Surround Command           | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `y s <motion> <desired>`   | Add `desired` surround around text defined by `<motion>` |
| `d s <existing>`           | Delete `existing` surround                               |
| `c s <existing> <desired>` | Change `existing` surround to `desired`                  |
| `S <desired>`              | Surround when in visual modes (surrounds full selection) |

Some examples:

- `"test"` with cursor inside quotes type `cs"'` to end up with `'test'`
- `"test"` with cursor inside quotes type `ds"` to end up with `test`
- `"test"` with cursor inside quotes type `cs"t` and enter `123>` to end up with `<123>test</123>`

### vim-commentary

Similar to [vim-commentary](https://github.com/tpope/vim-commentary), but uses the VS Code native _Toggle Line Comment_ and _Toggle Block Comment_ features.

Usage examples:

- `gc` - toggles line comment. For example `gcc` to toggle line comment for current line and `gc2j` to toggle line comments for the current line and the next two lines.
- `gC` - toggles block comment. For example `gCi)` to comment out everything within parentheses.

### vim-indent-object

Based on [vim-indent-object](https://github.com/michaeljsmith/vim-indent-object), it allows for treating blocks of code at the current indentation level as text objects. Useful in languages that don't use braces around statements (e.g. Python).

Provided there is a new line between the opening and closing braces / tag, it can be considered an agnostic `cib`/`ci{`/`ci[`/`cit`.

| Command        | Description                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `<operator>ii` | This indentation level                                                                               |
| `<operator>ai` | This indentation level and the line above (think `if` statements in Python)                          |
| `<operator>aI` | This indentation level, the line above, and the line after (think `if` statements in C/C++/Java/etc) |

### vim-sneak

Based on [vim-sneak](https://github.com/justinmk/vim-sneak), it allows for jumping to any location specified by two characters.

| Setting                            | Description                                                 | Type    | Default Value |
| ---------------------------------- | ----------------------------------------------------------- | ------- | ------------- |
| vim.sneak                          | Enable/disable vim-sneak                                    | Boolean | false         |
| vim.sneakUseIgnorecaseAndSmartcase | Respect `vim.ignorecase` and `vim.smartcase` while sneaking | Boolean | false         |

Once sneak is active, initiate motions using the following commands. For operators sneak uses `z` instead of `s` because `s` is already taken by the surround plugin.

| Motion Command            | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `s<char><char>`           | Move forward to the first occurrence of `<char><char>`                  |
| `S<char><char>`           | Move backward to the first occurrence of `<char><char>`                 |
| `<operator>z<char><char>` | Perform `<operator>` forward to the first occurrence of `<char><char>`  |
| `<operator>Z<char><char>` | Perform `<operator>` backward to the first occurrence of `<char><char>` |

### CamelCaseMotion

Based on [CamelCaseMotion](https://github.com/bkad/CamelCaseMotion), though not an exact emulation. This plugin provides an easier way to move through camelCase and snake_case words.

| Setting                    | Description                    | Type    | Default Value |
| -------------------------- | ------------------------------ | ------- | ------------- |
| vim.camelCaseMotion.enable | Enable/disable CamelCaseMotion | Boolean | false         |

Once CamelCaseMotion is enabled, the following motions are available:

| Motion Command         | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `<leader>w`            | Move forward to the start of the next camelCase or snake_case word segment |
| `<leader>e`            | Move forward to the next end of a camelCase or snake_case word segment     |
| `<leader>b`            | Move back to the prior beginning of a camelCase or snake_case word segment |
| `<operator>i<leader>w` | Select/change/delete/etc. the current camelCase or snake_case word segment |

By default, `<leader>` is mapped to `\`, so for example, `d2i\w` would delete the current and next camelCase word segment.

### Input Method

Disable input method when exiting Insert Mode.

| Setting                                 | Description                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `vim.autoSwitchInputMethod.enable`      | Boolean denoting whether autoSwitchInputMethod is on/off.                                        |
| `vim.autoSwitchInputMethod.defaultIM`   | Default input method.                                                                            |
| `vim.autoSwitchInputMethod.obtainIMCmd` | The full path to command to retrieve the current input method key.                               |
| `vim.autoSwitchInputMethod.switchIMCmd` | The full path to command to switch input method, with `{im}` a placeholder for input method key. |

Any third-party program can be used to switch input methods. The following will walkthrough the configuration using [im-select](https://github.com/daipeihust/im-select).

1.  Install im-select (see [installation guide](https://github.com/daipeihust/im-select#installation))
1.  Find your default input method key

    - Mac:

      Switch your input method to English, and run the following in your terminal: `/<path-to-im-select-installation>/im-select` to output your default input method. The table below lists the common English key layouts for MacOS.

      | Key                            | Description |
      | ------------------------------ | ----------- |
      | com.apple.keylayout.US         | U.S.        |
      | com.apple.keylayout.ABC        | ABC         |
      | com.apple.keylayout.British    | British     |
      | com.apple.keylayout.Irish      | Irish       |
      | com.apple.keylayout.Australian | Australian  |
      | com.apple.keylayout.Dvorak     | Dvorak      |
      | com.apple.keylayout.Colemak    | Colemak     |

    - Windows:

      Refer to the [im-select guide](https://github.com/daipeihust/im-select#to-get-current-keyboard-locale) on how to discover your input method key. Generally, if your keyboard layout is en_US the input method key is 1033 (the locale ID of en_US). You can also find your locale ID from [this page](https://www.science.co.il/language/Locale-codes.php), where the `LCID Decimal` column is the locale ID.

1.  Configure `vim.autoSwitchInputMethod`.

    - MacOS:

      Given the input method key of `com.apple.keylayout.US` and `im-select` located at `/usr/local/bin`. The configuration is:

      ```json
      "vim.autoSwitchInputMethod.enable": true,
      "vim.autoSwitchInputMethod.defaultIM": "com.apple.keylayout.US",
      "vim.autoSwitchInputMethod.obtainIMCmd": "/usr/local/bin/im-select",
      "vim.autoSwitchInputMethod.switchIMCmd": "/usr/local/bin/im-select {im}"
      ```

    - Windows:

      Given the input method key of `1033` (en_US) and `im-select.exe` located at `D:/bin`. The configuration is:

      ```json
      "vim.autoSwitchInputMethod.enable": true,
      "vim.autoSwitchInputMethod.defaultIM": "1033",
      "vim.autoSwitchInputMethod.obtainIMCmd": "D:\\bin\\im-select.exe",
      "vim.autoSwitchInputMethod.switchIMCmd": "D:\\bin\\im-select.exe {im}"
      ```

The `{im}` argument above is a command-line option that will be passed to `im-select` denoting the input method to switch to. If using an alternative program to switch input methods, you should add a similar option to the configuration. For example, if the program's usage is `my-program -s imKey` to switch input method, the `vim.autoSwitchInputMethod.switchIMCmd` should be `/path/to/my-program -s {im}`.

### ReplaceWithRegister

Based on [ReplaceWithRegister](https://github.com/vim-scripts/ReplaceWithRegister), an easy way to replace existing text with the contents of a register.

| Setting                 | Description                        | Type    | Default Value |
| ----------------------- | ---------------------------------- | ------- | ------------- |
| vim.replaceWithRegister | Enable/disable ReplaceWithRegister | Boolean | false         |

Once active, type `gr` (say "go replace") followed by a motion to describe the text you want replaced by the contents of the register.

| Motion Command          | Description                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `[count]["a]gr<motion>` | Replace the text described by the motion with the contents of the specified register    |
| `[count]["a]grr`        | Replace the \[count\] lines or current line with the contents of the specified register |
| `{Visual}["a]gr`        | Replace the selection with the contents of the specified register                       |

### vim-textobj-entire

Similar to [vim-textobj-entire](https://github.com/kana/vim-textobj-entire).

Adds two useful text-objects:

- `ae` which represents the entire content of a buffer.
- `ie` which represents the entire content of a buffer without the leading and trailing spaces.

Usage examples:

- `dae` - delete the whole buffer content.
- `yie` - will yank the buffer content except leading and trailing blank lines.
- `gUae` - transform the whole buffer to uppercase.

### vim-textobj-arguments

Similar to the argument text object in [targets.vim](https://github.com/wellle/targets.vim). It is an easy way to deal with arguments inside functions in most programming languages.

| Motion Command | Description                        |
| -------------- | ---------------------------------- |
| `<operator>ia` | The argument excluding separators. |
| `<operator>aa` | The argument including separators. |

Usage examples:

- `cia` - change the argument under the cursor while preserving separators like comma `,`.
- `daa` - will delete the whole argument under the cursor and the separators if applicable.

| Setting                             | Description                  | Type        | Default Value |
| ----------------------------------- | ---------------------------- | ----------- | ------------- |
| vim.argumentObjectOpeningDelimiters | A list of opening delimiters | String list | ["(", "["]    |
| vim.argumentObjectClosingDelimiters | A list of closing delimiters | String list | [")", "]"]    |
| vim.argumentObjectSeparators        | A list of object separators  | String list | [","]         |

## 🎩 VSCodeVim tricks!

VS Code has a lot of nifty tricks and we try to preserve some of them:

- `gd` - jump to definition.
- `gq` - on a visual selection reflow and wordwrap blocks of text, preserving commenting style. Great for formatting documentation comments.
- `gb` - adds another cursor on the next word it finds which is the same as the word under the cursor.
- `af` - visual mode command which selects increasingly large blocks of text. For example, if you had "blah (foo [bar 'ba|z'])" then it would select 'baz' first. If you pressed `af` again, it'd then select [bar 'baz'], and if you did it a third time it would select "(foo [bar 'baz'])".
- `gh` - equivalent to hovering your mouse over wherever the cursor is. Handy for seeing types and error messages without reaching for the mouse!

## 📚 F.A.Q.

- None of the native Visual Studio Code `ctrl` (e.g. `ctrl+f`, `ctrl+v`) commands work

  Set the [`useCtrlKeys` setting](#vscodevim-settings) to `false`.

- Moving `j`/`k` over folds opens up the folds

  Try setting `vim.foldfix` to `true`. This is a hack; it works fine, but there are side effects (see [issue#22276](https://github.com/Microsoft/vscode/issues/22276)).

- Key repeat doesn't work

  Are you on a Mac? Did you go through our [mac-setup](#mac) instructions?

- There are annoying intellisense/notifications/popups that I can't close with `<esc>`! Or I'm in a snippet and I want to close intellisense

  Press `shift+<esc>` to close all of those boxes.

- How can I use the commandline when in Zen mode or when the status bar is disabled?

  This extension exposes a remappable command to show a VS Code style quick-pick version of the commandline, with more limited functionality. This can be remapped as follows in VS Code's keybindings.json settings file.

  ```json
  {
    "key": "shift+;",
    "command": "vim.showQuickpickCmdLine",
    "when": "editorTextFocus && vim.mode != 'Insert'"
  }
  ```

  Or for Zen mode only:

  ```json
  {
    "key": "shift+;",
    "command": "vim.showQuickpickCmdLine",
    "when": "inZenMode && vim.mode != 'Insert'"
  }
  ```

- How can I move the cursor by each display line with word wrapping?

  If you have word wrap on and would like the cursor to enter each wrapped line when using <kbd>j</kbd>, <kbd>k</kbd>, <kbd>↓</kbd> or <kbd>↑</kbd>, set the following in VS Code's keybindings.json settings file.

  <!-- prettier-ignore -->
  ```json
  {
    "key": "up",
    "command": "cursorUp",
    "when": "editorTextFocus && vim.active && !inDebugRepl && !suggestWidgetMultipleSuggestions && !suggestWidgetVisible"
  },
  {
    "key": "down",
    "command": "cursorDown",
    "when": "editorTextFocus && vim.active && !inDebugRepl && !suggestWidgetMultipleSuggestions && !suggestWidgetVisible"
  },
  {
    "key": "k",
    "command": "cursorUp",
    "when": "editorTextFocus && vim.active && !inDebugRepl && vim.mode == 'Normal' && !suggestWidgetMultipleSuggestions && !suggestWidgetVisible"
  },
  {
    "key": "j",
    "command": "cursorDown",
    "when": "editorTextFocus && vim.active && !inDebugRepl && vim.mode == 'Normal' && !suggestWidgetMultipleSuggestions && !suggestWidgetVisible"
  }
  ```

  **Caveats:** This solution restores the default VS Code behavior for the <kbd>j</kbd> and <kbd>k</kbd> keys, so motions like `10j` [will not work](https://github.com/VSCodeVim/Vim/pull/3623#issuecomment-481473981). If you need these motions to work, [other, less performant options exist](https://github.com/VSCodeVim/Vim/issues/2924#issuecomment-476121848).

- I've swapped Escape and Caps Lock with setxkbmap and VSCodeVim isn't respecting the swap

  This is a [known issue in VS Code](https://github.com/microsoft/vscode/issues/23991), as a workaround you can set `"keyboard.dispatch": "keyCode"` and restart VS Code.

- VSCodeVim is too slow!

  You can try adding the following [setting](https://github.com/microsoft/vscode/issues/75627#issuecomment-1078827311), and reload/restart VSCode:

  ```json
  "extensions.experimental.affinity": {
    "vscodevim.vim": 1
  }
  ```

  **Caveats:** One issue with using the affinity setting is that each time you update your settings file, the Vim plugin will reload, which can take a few seconds.

## ❤️ Contributing

This project is maintained by a group of awesome [people](https://github.com/VSCodeVim/Vim/graphs/contributors) and contributions are extremely welcome :heart:. For a quick tutorial on how you can help, see our [contributing guide](/.github/CONTRIBUTING.md).

<a href="https://www.buymeacoffee.com/jasonpoon" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Us A Coffee" style="height: auto !important;width: auto !important;" ></a>

### Special shoutouts to:

- Thanks to @xconverge for making over 100 commits to the repo. If you're wondering why your least favorite bug packed up and left, it was probably him.
- Thanks to @Metamist for implementing EasyMotion!
- Thanks to @sectioneight for implementing text objects!
- Special props to [Kevin Coleman](http://kevincoleman.io), who created our awesome logo!
- Shoutout to @chillee aka Horace He for his contributions and hard work.
