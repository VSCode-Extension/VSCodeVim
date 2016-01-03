# Vim

[![Build Status](https://travis-ci.org/VSCodeVim/Vim.svg?branch=master)](https://travis-ci.org/VSCodeVim/Vim) [![Build status](https://ci.appveyor.com/api/projects/status/github/vscodevim/vim?branch=master&svg=true&retina=true)](https://ci.appveyor.com/project/guillermooo/vim/branch/master) [![Slack Status](https://vscodevim-slackin.azurewebsites.net/badge.svg)](https://vscodevim-slackin.azurewebsites.net)

Vim (aka. VSCodeVim) is a [Visual Studio Code](https://code.visualstudio.com/) extension that enables the power of the Vim keybinding experience within Visual Studio Code. 

![Screenshot](images/screen.png)

## Install

1. Within Visual Studio Code, open the command palette (`Ctrl-Shift-P` / `Cmd-Shift-P`)
2. Select `Install Extension` and search for 'vim' *or* run `ext install vim`

## Configure

Adjust configurations through user settings (File -> Preferences -> User Settings).

* vim.keyboardLayout: 
    * Supported Values: `en-US (QWERTY)` (default), `es-ES (QWERTY)`, `de-DE (QWERTZ)`
    
## Project Status

See our [release notes](https://github.com/VSCodeVim/Vim/releases) for full details.

### Completed

* Switching Modes:
    * Command: `Esc`, `Ctrl+[`
	* Insert: `i`, `I`, `a`, `A`, `o`, `O`
	* Current Mode displayed in the status bar in the bottom left

* Commands:
	* Command Palette: `:`
	* Navigation: `h`, `j`, `k`, `l`, `$`, `0`, `^`, `gg`, `G`, `w`, `e`, `b`
	* Indentation: `>>`, `<<`
	* Deletion: `dd`, `dw`, `db`
	* Editing: `u`, `ctrl+r`
	* File Operations: `:q`, `:w`
    
## Contributing

This project is maintained by a group of awesome [contributors](https://github.com/VSCodeVim/Vim/graphs/contributors). *Thank you!* :heart: 

## License

[MIT](LICENSE.txt)
