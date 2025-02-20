# 标识

:white_check_mark: - 已完成

:white_check_mark: :star: - 已完成，基于 VSCode 的实现

:warning: - 不支持此命令的某些特殊用法

:running: - 开发中

:arrow_down: - 低优先级；如果希望使用它，请提交相关 issue

:x: - 此命令在当前 VSCode 版本中无法实现

:1234: - 接受数字类型的前缀

> 翻译名词释义
>
> 光标: 普通模式下的光标
>
> 向前: 光标相对于当前位置向右或向下移动
>
> 向后: 光标相对于当前位置向左或向上移动

## 开发进度

以下为 vim 的重要功能，开发计划通常按以下顺序依次实现相关功能。

| 状态               | 命令              |
| ------------------ | ----------------- |
| :white_check_mark: | 普通模式          |
| :white_check_mark: | 插入模式          |
| :white_check_mark: | 可视模式          |
| :white_check_mark: | 行内可视模式      |
| :white_check_mark: | 数字前缀          |
| :white_check_mark: | '.' 操作符        |
| :white_check_mark: | 使用 '/' '?' 搜索 |
| :white_check_mark: | 撤消/恢复         |
| :warning:          | 命令重映射        |
| :warning:          | 标记              |
| :white_check_mark: | 文本对象          |
| :white_check_mark: | 可视块模式        |
| :white_check_mark: | 替换模式          |
| :white_check_mark: | 多选模式          |
| :warning:          | 宏                |
| :warning:          | Buffer/Window/Tab |

以下列表展示了在本插件中可以使用的 Vim 命令

## 自定义命令

- `gh` - 显示鼠标 hover 在当前位置时的提示信息
- `gb` - 在下一个匹配当前光标所处单词的地方增加一个光标

## 左右移动

| 状态               | 命令           | 描述                                                                      |
| ------------------ | -------------- | ------------------------------------------------------------------------- |
| :white_check_mark: | :1234: h       | 左移 (或者: CTRL-H, BS, 或左方向键)                                       |
| :white_check_mark: | :1234: l       | 右移 (或者: 空格键或右方向键)                                             |
| :white_check_mark: | 0              | 移动到当前行的第一个字符处 (或者: Home 键)                                |
| :white_check_mark: | ^              | 移动到当前行的第一个非空字符处                                            |
| :white_check_mark: | :1234: \$      | 移动到当前行的最后一个字符处 (N-1 lines lower) (或者: End 键)             |
| :white_check_mark: | g0             | 移动到屏幕上显示行的第一个字符处(当有多行被折叠时，行为与 '0' 不同)       |
| :white_check_mark: | g^             | 移动到屏幕上显示行的第一个非空白字符处(当有多行被折叠时，行为与 '^' 不同) |
| :white_check_mark: | :1234: g\$     | 移动到屏幕上显示行的最后一个字符处(当有多行被折叠时，行为与 '\$' 不同)    |
| :white_check_mark: | gm             | 移动到屏幕上显示行的中央                                                  |
| :white_check_mark: | :1234: \       | 移动到指定列 (默认: 1)                                                    |
| :white_check_mark: | :1234: f{char} | 向右移动到第 N 个指定字符处                                               |
| :white_check_mark: | :1234: F{char} | 向左移动到第 N 个指定字符处                                               |
| :white_check_mark: | :1234: t{char} | 向右移动到第 N 个指定字符的前一个字符处                                   |
| :white_check_mark: | :1234: T{char} | 向左移动到第 N 个指定字符的前一个字符处                                   |
| :white_check_mark: | :1234: ;       | 重复执行 N 次上一次的 "f", "F", "t", 或 "T" 命令                          |
| :white_check_mark: | :1234: ,       | 反向重复执行 N 次上一次的 “f“，“F“，“t“，或“T“命令                        |

## 上下移动

| 状态               | 命令      | 描述                                                         |
| ------------------ | --------- | ------------------------------------------------------------ |
| :white_check_mark: | :1234: k  | 上移 (或者: CTRL-P and Up)                                   |
| :white_check_mark: | :1234: j  | 下移 (或者: CTRL-J, CTRL-N, NL, and Down)                    |
| :white_check_mark: | :1234: -  | 上移，光标将位于第一个非空白字符上                           |
| :white_check_mark: | :1234: +  | 下移，光标将位于第一个非空白字符上 (或者: CTRL-M and CR)     |
| :white_check_mark: | :1234: \_ | 下移 N-1 行，光标将位于第一个非空白字符上                    |
| :white_check_mark: | :1234: G  | 移动到第 N 行，光标将位于第一个非空白字符上(默认: 最后一行)  |
| :white_check_mark: | :1234: gg | 移动到第 N 行，光标将位于第一个非空白字符上(默认: 第一行)    |
| :white_check_mark: | :1234: %  | 移动到当前文件的第 N%行，必须指定 N，否则将执行’%‘命令       |
| :white_check_mark: | :1234: gk | 上移 N 行(当有折叠行时与'k’命令的行为不同，折叠行被视作一行) |
| :white_check_mark: | :1234: gj | 下移 N 行(当有折叠行时与'j’命令的行为不同，折叠行被视作一行) |

## 针对文本对象的移动方式

| 状态               | 命令       | 描述                                                     |
| ------------------ | ---------- | -------------------------------------------------------- |
| :white_check_mark: | :1234: w   | 向前移动 N 个单词                                        |
| :white_check_mark: | :1234: W   | 向前移动 N 个单词，忽略分割符                            |
| :white_check_mark: | :1234: e   | 向前移动 N 个单词，光标位于第 N 个单词的结尾             |
| :white_check_mark: | :1234: E   | 向前移动 N 个单词，光标位于第 N 个单词的结尾，忽略分割符 |
| :white_check_mark: | :1234: b   | 向后移动 N 个单词                                        |
| :white_check_mark: | :1234: B   | 向后移动 N 个单词，忽略分割符                            |
| :white_check_mark: | :1234: ge  | 向后移动 N 个单词，光标位于第 N 个单词的结尾             |
| :white_check_mark: | :1234: gE  | 向后移动 N 个单词，光标位于第 N 个单词的结尾，忽略分割符 |
| :white_check_mark: | :1234: )   | 向前移动 N 个句子                                        |
| :white_check_mark: | :1234: (   | 向后移动 N 个句子                                        |
| :white_check_mark: | :1234: }   | 向前移动 N 个段落                                        |
| :white_check_mark: | :1234: {   | 向后移动 N 个段落                                        |
| :white_check_mark: | :1234: ]]  | 向前移动 N 个缓冲区,光标位于开始位置                     |
| :white_check_mark: | :1234: [[  | 向后移动 N 个缓冲区,光标位于开始位置                     |
| :white_check_mark: | :1234: ][  | 向前移动 N 个缓冲区,光标位于结束位置                     |
| :white_check_mark: | :1234: []  | 向后移动 N 个缓冲区,光标位于结束位置                     |
| :white_check_mark: | :1234: [(  | 向后移动到第 N 个未闭合的'('处                           |
| :white_check_mark: | :1234: [{  | 向后移动到第 N 个未闭合的'{'处                           |
| :arrow_down:       | :1234: [m  | 向后移动到第 N 个方法的开始位置(Java)                    |
| :arrow_down:       | :1234: [M  | 向后移动到第 N 个方法的结束位置(Java)                    |
| :white_check_mark: | :1234: ])  | 向前移动到第 N 个未闭合的')'处                           |
| :white_check_mark: | :1234: ]}  | 向前移动到第 N 个未闭合的'}'处                           |
| :arrow_down:       | :1234: ]m  | 向前移动到第 N 个方法的开始位置(Java)                    |
| :arrow_down:       | :1234: ]M  | 向前移动到第 N 个方法的结束位置(Java)                    |
| :arrow_down:       | :1234: [#  | 向后移动到第 N 个未匹配的 #if、#else                     |
| :arrow_down:       | :1234: ]#  | 向前移动到第 N 个未匹配的 #else、#endif                  |
| :arrow_down:       | :1234: [\* | 向后移动到第 N 个 C 注释的开始位置                       |
| :arrow_down:       | :1234: ]\* | 向前移动到第 N 个 C 注释的开始位置                       |

## 按模式搜索

| 状态                      | 命令                               | 描述                           | 备注                                                        |
| ------------------------- | ---------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| :white_check_mark: :star: | :1234: `/{pattern}[/[offset]]<CR>` | 向前搜索{pattern}的第 N 次出现 | 当前仅支持 JavaScript 的正则引擎，不支持 Vim 的内置正则引擎 |
| :white_check_mark: :star: | :1234: `?{pattern}[?[offset]]<CR>` | 向后搜索{pattern}的第 N 次出现 | 当前仅支持 JavaScript 的正则引擎，不支持 Vim 的内置正则引擎 |
| :warning:                 | :1234: `/<CR>`                     | 向前重复最后一次搜索           | 不支持数量参数                                              |
| :warning:                 | :1234: `?<CR>`                     | 向后重复最后一次搜索           | 不支持数量参数                                              |
| :white_check_mark:        | :1234: n                           | 重复上一次搜索                 |                                                             |
| :white_check_mark:        | :1234: N                           | 反方向重复上一次搜索           |                                                             |
| :white_check_mark:        | :1234: \*                          | 向前搜索当前光标所处的单词     |                                                             |
| :white_check_mark:        | :1234: #                           | 向后搜索当前光标所处的单词     |                                                             |
| :white_check_mark:        | :1234: g\*                         | 类似于 "\*", 执行部分匹配      |                                                             |
| :white_check_mark:        | :1234: g#                          | 类似于 "#", 执行部分匹配       |                                                             |
| :white_check_mark:        | gd                                 | 跳转到当前光标所处标识的声明处 |                                                             |
| :arrow_down:              | gD                                 | 跳转到当前光标所处标识的声明处 |                                                             |

## 标记定位

| 状态               | 命令                | 描述                                                   |
| ------------------ | ------------------- | ------------------------------------------------------ |
| :white_check_mark: | m{a-zA-Z}           | 使用{a-zA-Z}标记当前位置                               |
| :white_check_mark: | `{a-z}              | 跳转到当文件中的{a-z}标记处                            |
| :white_check_mark: | `{A-Z}              | 跳转到任意文件中的{A-Z}                                |
| :white_check_mark: | `{0-9}              | 跳转到 Vim 上次退出时的位置                            |
| :white_check_mark: | ``                  | 跳转到 Vim 最后一次跳转之前的位置                      |
| :arrow_down:       | `"                  | 跳转到当前文件中最后一次编辑的位置                     |
| :white_check_mark: | `[                  | 跳转到上一次操作或输入文本的开始位置                   |
| :white_check_mark: | '[                  | 跳转到上一次操作或输入文本的开始位置                   |
| :white_check_mark: | `]                  | 跳转到上一次操作或输入文本的结束位置                   |
| :white_check_mark: | ']                  | 跳转到上一次操作或输入文本的结束位置                   |
| :arrow_down:       | `<                  | 跳转到(上一个)可视区开始                               |
| :arrow_down:       | `>                  | 跳转到(上一个)可视区末尾                               |
| :white_check_mark: | `.                  | 跳转到此文件的最后一次修改处                           |
| :white_check_mark: | '.                  | 跳转到此文件的最后一次修改处                           |
| :arrow_down:       | '{a-zA-Z0-9[]'"<>.} | 与`命令的意义相同,除了会定位到所在行的第一个非空白字符 |
| :white_check_mark: | :marks              | 打印当前活动的标记                                     |
| :white_check_mark: | :1234: CTRL-O       | 跳转到跳转列表的第 N 个旧位置                          |
| :white_check_mark: | :1234: CTRL-I       | 跳转到跳转列表的第 N 个新位置                          |
| :white_check_mark: | :ju[mps]            | 打印跳转列表                                           |

## 其它移动方式

| 状态               | 命令                | 描述                                                                                                 |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------------------- |
| :white_check_mark: | %                   | 在当前行中查找下一个大括号，中括号，小括号或者"#if"/ "#else"/"#endif",并且跳转到与之匹配的结束标记处 |
| :white_check_mark: | :1234: H            | 跳转到距离视口首行第 N 行的第一个非空字符处                                                          |
| :white_check_mark: | M                   | 跳转到视口中央行的第一个非空字符处                                                                   |
| :white_check_mark: | :1234: L            | 跳转到距离视口最后一行第 N 行的第一个非空字符处                                                      |
| :arrow_down:       | :1234: go           | 跳转到 buffer 中的第 N 个字节                                                                        |
| :arrow_down:       | :[range]go[to][off] | 跳转到 buffer 开始后[off]个字节的位置                                                                |

## tag 的使用方法

以下命令均为低优先级，VSCode 对于可跳转标签有很好的支持，你可以通过命令面板来尝试使用它们。

| 状态         | 命令                   | 描述                                               |
| ------------ | ---------------------- | -------------------------------------------------- |
| :arrow_down: | :ta[g][!] {tag}        | 跳转到{tag}处                                      |
| :arrow_down: | :[count]ta[g][!]       | 跳转到 tag 列表中的第[count]个 tag 处              |
| :arrow_down: | CTRL-]                 | 跳转到当前光标下的 tag 处,除非修改已经发生         |
| :arrow_down: | :ts[elect][!] [tag]    | 列出匹配的 tag,选择并跳转                          |
| :arrow_down: | :tj[ump][!] [tag]      | 跳转到[tag]tag 处,如果有多个匹配将列出匹配项供选择 |
| :arrow_down: | :lt[ag][!] [tag]       | 跳转到[tag]tag 处,将其添加到本地的 tag 列表        |
| :arrow_down: | :tagsa                 | 输出 tag 列表                                      |
| :arrow_down: | :1234: CTRL-T          | 从 tag 列表中的第 N 个旧 tag 跳回来                |
| :arrow_down: | :[count]po[p][!]       | 从 tag 列表中的第[count]个旧 tag 跳转回来          |
| :arrow_down: | :[count]tn[ext][!]     | 跳转到接下来的第[count]个匹配的 tag 处             |
| :arrow_down: | :[count]tp[revious][!] | 跳转到之前的第[count]个匹配的 tag 处               |
| :arrow_down: | :[count]tr[ewind][!]   | 跳转到第[count]个匹配的标签处                      |
| :arrow_down: | :tl[ast][!]            | 跳转到最后一个匹配的 tag 处                        |
| :arrow_down: | :pt[ag] {tag}          | 打开预览窗口以显示 tag{tag}                        |
| :arrow_down: | CTRL-W }               | 类似于 CTRL-],但是在预览窗口中显示 tag             |
| :arrow_down: | :pts[elect]            | 类似于":tselect",但是在预览窗口中显示 tag          |
| :arrow_down: | :ptj[ump]              | 类似于":tjump",但是在预览窗口中显示 tag            |
| :arrow_down: | :pc[lose]              | 关闭 tag 预览窗口                                  |
| :arrow_down: | CTRL-W z               | 关闭 tag 预览窗口                                  |

## 滚动

| 状态               | 命令          | 描述                               |
| ------------------ | ------------- | ---------------------------------- |
| :white_check_mark: | :1234: CTRL-E | 向下滚动 N 行(默认: 1)             |
| :white_check_mark: | :1234: CTRL-D | 向下滚动 N 个 1/2 屏(默认: 1/2 屏) |
| :white_check_mark: | :1234: CTRL-F | 向下滚动 N 屏                      |
| :white_check_mark: | :1234: CTRL-Y | 向上滚动 N 行(默认: 1)             |
| :white_check_mark: | :1234: CTRL-U | 向上滚动 N 个 1/2 屏(默认: 1/2 屏) |
| :white_check_mark: | :1234: CTRL-B | 向上滚动 N 屏                      |
| :white_check_mark: | z CR or zt    | 将当前行移到屏幕顶部               |
| :white_check_mark: | z. or zz      | 将当前行移到屏幕中央               |
| :white_check_mark: | z- or zb      | 将当前行移到屏幕底部               |

以下命令仅在换行关闭时有效:

| 状态                      | 命令      | 描述                 | 备注                                                               |
| ------------------------- | --------- | -------------------- | ------------------------------------------------------------------ |
| :white_check_mark: :star: | :1234: zh | 向右滚动 N 个字符    | 在 VSCode 中，当运行此命令时，无论水平滚动条是否移动，光标总会移动 |
| :white_check_mark: :star: | :1234: zl | 向右滚动 N 个字符    | 同上                                                               |
| :white_check_mark: :star: | :1234: zH | 向右滚动半个屏幕宽度 | 同上                                                               |
| :white_check_mark: :star: | :1234: zL | 向左滚动半个屏幕宽度 | 同上                                                               |

## 插入文本

| 状态               | 命令      | 描述                           |
| ------------------ | --------- | ------------------------------ |
| :white_check_mark: | :1234: a  | 在光标后方插入文本             |
| :white_check_mark: | :1234: A  | 在行尾插入文本                 |
| :white_check_mark: | :1234: i  | 在光标前方插入文本             |
| :white_check_mark: | :1234: I  | 在本行第一个非空字符前插入文本 |
| :white_check_mark: | :1234: gI | 在第一列前插入文本             |
| :white_check_mark: | gi        | 在最后一次改动处插入文本       |
| :white_check_mark: | :1234: o  | 在当前行的下方插入新行         |
| :white_check_mark: | :1234: O  | 在当前行的上方插入新行         |

以下命令在可视模式下的行为 :

| 状态               | 命令 | 描述                         |
| ------------------ | ---- | ---------------------------- |
| :white_check_mark: | I    | 在所选行的前方插入相同的文本 |
| :white_check_mark: | A    | 在所选行的后方插入相同的文本 |

## 插入模式

退出插入模式 :

| 状态               | 命令             | 描述                       |
| ------------------ | ---------------- | -------------------------- |
| :white_check_mark: | Esc              | 退出插入模式               |
| :white_check_mark: | CTRL-C           | 和 Esc 相同,但是不使用缩写 |
| :white_check_mark: | CTRL-O {command} | 执行命令并返回插入模式     |

其它移动命令 :

| 状态               | 命令             | 描述                               |
| ------------------ | ---------------- | ---------------------------------- |
| :white_check_mark: | cursor keys      | 移动光标 上/右/左/下               |
| :white_check_mark: | shift-left/right | 向左（右）移动一个单词             |
| :white_check_mark: | shift-up/down    | 向前或后移动一屏                   |
| :white_check_mark: | End              | 将光标移动到当前行的最后一个字符后 |
| :white_check_mark: | Home             | 将光标移动到当前行的第一个字符     |

## 插入模式下的特殊命令

| 状态                      | 命令                         | 描述                                       | 备注                                                                 |
| ------------------------- | ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| :arrow_down:              | CTRL-V {char}..              | 插入字符或十进制字节值                     |                                                                      |
| :warning:                 | NL or CR or CTRL-M or CTRL-J | 开启新行                                   | 不支持 CTRL-M 和 CTRL-J                                              |
| :white_check_mark:        | CTRL-E                       | 从光标下方插入字符                         |                                                                      |
| :white_check_mark:        | CTRL-Y                       | 从光标上方插入字符                         |                                                                      |
| :white_check_mark: :star: | CTRL-A                       | 插入之前插入过的文本                       | 使用上一个 "插入" 会话中所做的更改, 并且只应用在光标插入下发生的更改 |
| :white_check_mark: :star: | CTRL-@                       | 插入之前插入过的文本，然后退出插入模式     | 同上                                                                 |
| :white_check_mark:        | CTRL-R {0-9a-z%#:.-="}       | 插入寄存器中的内容                         |                                                                      |
| :white_check_mark:        | CTRL-N                       | 在光标前插入标识符的下一个匹配项           |                                                                      |
| :white_check_mark:        | CTRL-P                       | 在光标前插入标识符的上一个匹配项           |                                                                      |
| :arrow_down:              | CTRL-X ...                   | 补全光标前的单词                           |                                                                      |
| :white_check_mark:        | BS or CTRL-H                 | 删除光标前的字符                           |                                                                      |
| :white_check_mark:        | Del                          | 删除光标所在的字符                         |                                                                      |
| :white_check_mark:        | CTRL-W                       | 删除光标前的单词                           |                                                                      |
| :white_check_mark:        | CTRL-U                       | 删除当前行中所有输入的字符                 |                                                                      |
| :white_check_mark:        | CTRL-T                       | 在当前行首插入一个缩进的位移宽度           |                                                                      |
| :white_check_mark:        | CTRL-D                       | 在当前行首删除一个缩进的位移宽度           |                                                                      |
| :arrow_down:              | 0 CTRL-D                     | 删除当前行的所有缩进                       |                                                                      |
| :arrow_down:              | ^ CTRL-D                     | 删除当前行中的所有缩进，在下一行中恢复缩进 |                                                                      |

## 导向图

| 状态               | 命令                                    | 描述                   |
| ------------------ | --------------------------------------- | ---------------------- |
| :white_check_mark: | :dig[raphs]                             | 显示当前导向图列表     |
| :arrow_down:       | :dig[raphs] {char1}{char2} {number} ... | 向列表中添加新的导向图 |

## 插入特殊内容

| 状态      | 命令          | 描述                              |
| --------- | ------------- | --------------------------------- |
| :warning: | :r [file]     | 在光标下面插入[file]的内容        |
| :warning: | :r! {command} | 在光标下方插入{command}的标准输出 |

## 删除文本

| 状态               | 命令             | 描述                                            |
| ------------------ | ---------------- | ----------------------------------------------- |
| :white_check_mark: | :1234: x         | 从光标所处的当前字符开始删除 N 个字符           |
| :white_check_mark: | :1234: Del       | 从光标所处的当前字符开始删除 N 个字符           |
| :white_check_mark: | :1234: X         | 删除光标前的 N 个字符                           |
| :white_check_mark: | :1234: d{motion} | 删除{motion}移动时经过的文本                    |
| :white_check_mark: | {visual}d        | 删除高亮文本                                    |
| :white_check_mark: | :1234: dd        | 删除 N 行                                       |
| :white_check_mark: | :1234: D         | 删除到行尾                                      |
| :white_check_mark: | :1234: J         | 连接当前行和下一行(删除空行)                    |
| :white_check_mark: | {visual}J        | 连接所有高亮的行                                |
| :white_check_mark: | :1234: gJ        | 和"J"命令相同, 但是不会在连接处插入空格         |
| :white_check_mark: | {visual}gJ       | 和"{visual}J"命令相同, 但是不会在连接处插入空格 |
| :white_check_mark: | :[range]d [x]    | 删除[range]行，并添加到寄存器                   |

## 文本复制和移动

| 状态               | 命令             | 描述                                             |
| ------------------ | ---------------- | ------------------------------------------------ |
| :white_check_mark: | "{char}          | 使用寄存器中的{char}进行下一次的删除、复制或粘贴 |
| :white_check_mark: | "\*              | 使用寄存器`*`访问系统剪贴板                      |
| :white_check_mark: | :reg             | 显示寄存器中的所有内容                           |
| :white_check_mark: | :reg {arg}       | 显示寄存器中{arg}的内容                          |
| :white_check_mark: | :1234: y{motion} | 把 {motion} 过程覆盖的文本放入寄存器             |
| :white_check_mark: | {visual}y        | 把高亮文本放入寄存器                             |
| :white_check_mark: | :1234: yy        | 把当前行开始的 N 行放入寄存器(包含当前行)        |
| :white_check_mark: | :1234: Y         | 把当前行开始的 N 行放入寄存器(包含当前行)        |
| :white_check_mark: | :1234: p         | 把寄存器中的内容放置到光标后方(执行 N 次)        |
| :white_check_mark: | :1234: P         | 把寄存器中的内容放置到光标前方(执行 N 次)        |
| :white_check_mark: | :1234: ]p        | 类似于 p,但是会调整当前行的缩进                  |
| :white_check_mark: | :1234: [p        | 类似于 p,但是会调整当前行的缩进                  |
| :white_check_mark: | :1234: gp        | 类似于 p,但是会在新的文本后留下光标              |
| :white_check_mark: | :1234: gP        | 类似于 p,但是会在新的文本后留下光标              |

## 修改文本

| 状态                      | 命令            | 描述                                             | 备注          |
| ------------------------- | --------------- | ------------------------------------------------ | ------------- |
| :white_check_mark:        | :1234: r{char}  | 使用{char}替换 N 个字符                          |               |
| :arrow_down:              | :1234: gr{char} | 在不影响布局的情况下替换 N 个字符                |               |
| :white_check_mark: :star: | :1234: R        | 进入替换模式(重复 N 次输入的文本)                | 不支持{count} |
| :arrow_down:              | :1234: gR       | 进入可视替换模式: 和替换模式类似，但不会影响布局 |               |
| :white_check_mark:        | {visual}r{char} | 在可视模式中把所有选中的文本替换成{char}         |               |

(以下命令为删除文本同时进入插入模式)

| 状态               | 命令                    | 描述                                                |
| ------------------ | ----------------------- | --------------------------------------------------- |
| :white_check_mark: | :1234: c{motion}        | 修改移动命令{motion}经过的文本                      |
| :white_check_mark: | {visual}c               | 修改高亮文本                                        |
| :white_check_mark: | :1234: cc               | 修改 N 行(包含当前行)                               |
| :white_check_mark: | :1234: S                | 修改 N 行(包含当前行)                               |
| :white_check_mark: | :1234: C                | 修到行尾的内容(包括 N-1 行)                         |
| :white_check_mark: | :1234: s                | 修改 N 个字符                                       |
| :white_check_mark: | {visual}c               | 在可视模式下:将选中的内容修改为输入的文本           |
| :white_check_mark: | {visual}C               | 在可视模式下:将选中的行修改为输入的文本             |
| :white_check_mark: | {visual}~               | 在可视模式下:切换选中内容的大小写状态               |
| :white_check_mark: | {visual}u               | 在可视模式下:将选中的内容切换为小写                 |
| :white_check_mark: | {visual}U               | 在可视模式下:将选中的内容切换为大写                 |
| :white_check_mark: | g~{motion}              | 切换移动命令{motion}经过文本的大小写状态            |
| :white_check_mark: | gu{motion}              | 将移动命令{motion}经过的文本切换为小写              |
| :white_check_mark: | gU{motion}              | 将移动命令{motion}经过的文本切换为大写              |
| :white_check_mark: | {visual}g?              | 将高亮文本执行 rot13 编码                           |
| :white_check_mark: | g?{motion}              | 将移动命令{motion}经过的文本执行 rot13 编码         |
| :white_check_mark: | :1234: CTRL-A           | 将光标处或之后的数字增加 N                          |
| :white_check_mark: | :1234: CTRL-X           | 将光标处或之后的数字减去 N                          |
| :white_check_mark: | :1234: <{motion}        | 将移动命令{motion}经过的行向左缩进                  |
| :white_check_mark: | :1234: <<               | 将 N 行向左缩进                                     |
| :white_check_mark: | :1234: >{motion}        | 将移动命令{motion}经过的行向左缩进                  |
| :white_check_mark: | :1234: >>               | 将 N 行向左缩进                                     |
| :white_check_mark: | :1234: gq{motion}       | 将移动命令{motion}经过的行格式化到 'textwidth' 长度 |
| :arrow_down:       | :[range]ce[nter][width] | 居中对齐[range]范围内的行                           |
| :arrow_down:       | :[range]le[ft][indent]  | 左对齐[range]范围内的行 (with [indent])             |
| :arrow_down:       | :[ranee]ri[ght][width]  | 左对齐[range]范围内的行                             |

## 复杂的修改

| 状态                                | 命令                                           | 描述                                                                                | 备注                                          |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| :arrow_down:                        | :1234: `!{motion}{command}<CR>`                | 过滤通过{command}移动的行                                                           |                                               |
| :arrow_down:                        | :1234: `!!{command}<CR>`                       | 通过{command}过滤 N 行                                                              |                                               |
| :arrow_down:                        | `{visual}!{command}<CR>`                       | 通过{command}过滤高亮行                                                             |                                               |
| :arrow_down:                        | `:[range]! {command}<CR>`                      | 通过{command}过滤[range]行                                                          |                                               |
| :white_check_mark:                  | :1234: ={motion}                               | 过滤通过'equalprg'移动的行                                                          |                                               |
| :white_check_mark:                  | :1234: ==                                      | 通过'equalprg'过滤 N 行                                                                    |                                               |
| :white_check_mark:                  | {visual}=                                      | 通过'equalprg'过滤高亮行                                                            |                                               |
| :white_check_mark: :star: :warning: | :[range]s[ubstitute]/{pattern}/{string}/[g][c] | 在[range]行中用{string}替换{pattern};用[g]替换所有出现的{pattern};[c]，确认每次更换 | 当前只支持 JavaScript 的正则;仅实现了'gi'选项 |
| :arrow_down:                        | :[range]s[ubstitute][g][c]                     | 使用新的范围和选项重复上一个":s"                                                    |                                               |
| :arrow_down:                        | &                                              | 在当前行上重得上一个":s",忽略选项                                                   |                                               |
| :arrow_down:                        | :[range]ret[ab][!] [tabstop]                   | 将'tabstop'设置为新值并调整空格                                                     |                                               |

## 可视模式

| 状态               | 命令   | 描述                               |
| ------------------ | ------ | ---------------------------------- |
| :white_check_mark: | v      | 从当前位置开始高亮字符或者停止高亮 |
| :white_check_mark: | V      | 从当前行开始高亮或者停止高亮       |
| :white_check_mark: | CTRL-V | 高亮块级区域或退出高亮模式         |
| :white_check_mark: | o      | 高亮文本开始与当前光标位置间切换   |
| :white_check_mark: | gv     | 重新打开前一次的高亮区域           |

## 文本对象 (仅在可视模式下有效)

| 状态               | 命令              | 描述                                           |
| ------------------ | ----------------- | ---------------------------------------------- |
| :white_check_mark: | :1234: aw         | 选择一个单词                                   |
| :white_check_mark: | :1234: iw         | 选择一个内置单词                               |
| :white_check_mark: | :1234: aW         | 选择一个单词                                   |
| :white_check_mark: | :1234: iW         | 选择一个内置单词                               |
| :white_check_mark: | :1234: as         | 选择一个缓冲区                                 |
| :white_check_mark: | :1234: is         | 选择一个内置缓冲区                             |
| :white_check_mark: | :1234: ap         | 选择一个段落                                   |
| :white_check_mark: | :1234: ip         | 选择一个内置缓冲区                             |
| :white_check_mark: | :1234: a], a[     | 选择一个中括号区域                             |
| :white_check_mark: | :1234: i], i[     | 选择一个内置中括号区域                         |
| :white_check_mark: | :1234: ab, a(, a) | 选择从"[(" 到 "])"的区域                       |
| :white_check_mark: | :1234: ib, i), i( | 选择从"[(" 到 "])"的内置区域                   |
| :white_check_mark: | :1234: a>, a<     | 选择"<>"区域                                   |
| :white_check_mark: | :1234: i>, i<     | 选择"<>"的内部区域                             |
| :white_check_mark: | :1234: aB, a{, a} | 选择从"[{" 到 "})"的区域                       |
| :white_check_mark: | :1234: iB, i{, i} | 选择从"[{" 到 "})"的内置区域                   |
| :white_check_mark: | :1234: at         | 选择标签从&lt;aaa&gt;到 &lt;/aaa&gt;的区域     |
| :white_check_mark: | :1234: it         | 选择标签从&lt;aaa&gt;到 &lt;/aaa&gt;的内部区域 |
| :white_check_mark: | :1234: a'         | 选择单引号区域                                 |
| :white_check_mark: | :1234: i'         | 选择单引号内置区域                             |
| :white_check_mark: | :1234: a"         | 选择双引号区域                                 |
| :white_check_mark: | :1234: i"         | 选择双引号内置区域                             |
| :white_check_mark: | :1234: a`         | 选择反引号区域                                 |
| :white_check_mark: | :1234: i`         | 选择反引号内置区域                             |

## 重复性命令

| 状态                      | 命令                              | 描述                                                | 备注                         |
| ------------------------- | --------------------------------- | --------------------------------------------------- | ---------------------------- |
| :white_check_mark: :star: | :1234: .                          | 重复最后一次修改(N:重复次数)                        | 未发生在光标下的修改无法重复 |
| :white_check_mark:        | q{a-z}                            | 重复寄存器中{a-z}的字符                             |                              |
| :arrow_down:              | q{A-Z}                            | 记录输入的字符,放入寄存器中,对应的标记为小写的{a-z} |                              |
| :white_check_mark:        | q                                 | 停止记录                                            |                              |
| :white_check_mark:        | :1234: @{a-z}                     | 执行 N 次寄存器中{a-z}的内容                        |                              |
| :white_check_mark:        | :1234: @@                         | 重复 N 次前一个:@{a-z}                              |                              |
| :arrow_down:              | :@{a-z}                           | 将寄存器{a-z}的内容作为 Ex 命令执行                 |                              |
| :arrow_down:              | :@@                               | 重复一次:@{a-z}                                     |                              |
| :arrow_down:              | :[range]g[lobal]/{pattern}/[cmd]  | 在{pattern}匹配的[range]行上执行 Ex 命令 cmd        |                              |
| :arrow_down:              | :[range]g[lobal]!/{pattern}/[cmd] | 在{pattern}不匹配的[range]行上执行 Ex 命令 cmd      |                              |
| :arrow_down:              | :so[urce] {file}                  | 从{file}读取 Ex 命令                                |                              |
| :arrow_down:              | :so[urce]! {file}                 | 从{file}读取 Vim 命令                               |                              |
| :arrow_down:              | :sl[eep][sec]                     | 在[sec]秒内不执行任何命令                           |                              |
| :arrow_down:              | :1234: gs                         | 休眠 N 秒                                           |                              |

## 匹配项

| 状态                      | 命令                     | 描述                                                           | 备注               |
| ------------------------- | ------------------------ | -------------------------------------------------------------- | ------------------ |
| :arrow_down:              | :se[t]                   | 显示所有已修改的选项                                           |                    |
| :arrow_down:              | :se[t] all               | 显示所有的 non-termcap 选项                                    |                    |
| :arrow_down:              | :se[t] termcap           | 显示所有的 termcap 选项                                        |                    |
| :white_check_mark:        | :se[t] {option}          | 设置布尔值选项(打开),显示字符串或数字选项                      |                    |
| :white_check_mark:        | :se[t] no{option}        | 重置布尔值选项(关闭)                                           |                    |
| :white_check_mark:        | :se[t] inv{option}       | 反转布尔值选项                                                 |                    |
| :white_check_mark:        | :se[t] {option}={value}  | 将 string/number 选项的值设置成{value}                         |                    |
| :white_check_mark:        | :se[t] {option}+={value} | 将{value}添加到 string 选项, 将{value}添加到 number 选项       |                    |
| :white_check_mark: :star: | :se[t] {option}-={value} | 从 string 选项中移除{value}, 从 number 选项中减少{value}的值   | 不支持 string 选项 |
| :white_check_mark:        | :se[t] {option}?         | 显示{option}的选项                                             |                    |
| :arrow_down:              | :se[t] {option}&         | 重置{option}的值为默认值                                       |                    |
| :arrow_down:              | :setl[ocal]              | 类似于":set",但是会给具有本地值的选项设置值                    |                    |
| :arrow_down:              | :setg[lobal]             | 类似于":set",但是会给本地选项设置一个全局值                    |                    |
| :arrow_down:              | :fix[del]                | 根据't_kb'的值设置't_kD'的值                                   |                    |
| :arrow_down:              | :opt[ions]               | 打开一个新窗口以查看和设置选项，按功能分组，包含说明和帮助链接 |                    |

由于列表太长，这里仅列出已经支持的配置选项

| 状态               | 命令            | 默认值                                            | 描述                                                                                   |
| ------------------ | --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| :white_check_mark: | tabstop (ts)    | 4. 使用 VSCode 而非 Vim 的默认值`tabSize`         | 文件中 tab 代替的空格数                                                                |
| :white_check_mark: | hlsearch (hls)  | false                                             | 如果存在先前的搜索模式，请突出显示其所有匹配项                                         |
| :white_check_mark: | ignorecase (ic) | true                                              | 在搜索模式中忽略大小写                                                                 |
| :white_check_mark: | smartcase (scs) | true                                              | 如果搜索模式包含大写字符，则覆盖'ignorecase'选项                                       |
| :white_check_mark: | iskeyword (isk) | `@,48-57,_,128-167,224-235`                       | 关键字包含字母,数字,字符和'\_', 如果没有设置 iskeyword,使用 editor.wordSeparators 属性 |
| :white_check_mark: | scroll (scr)    | 20                                                | 使用 CTRL-U 和 CTRL-D 命令时滚动的行数                                                 |
| :white_check_mark: | expandtab (et)  | True. 使用 VSCode 而非 Vim 的默认值`insertSpaces` | 插入<Tab>时使用空格                                                                    |
| :white_check_mark: | autoindent      | true                                              | 在 noraml 模式下进行 cc 或 S 更换线时保持缩进                                          |

## 撤消/恢复 命令

| 状态               | 命令          | 描述                  | 备注                               |
| ------------------ | ------------- | --------------------- | ---------------------------------- |
| :white_check_mark: | :1234: u      | 撤消前 N 次修改       | 目前的实现可能无法完全涵盖所有情况 |
| :white_check_mark: | :1234: CTRL-R | 恢复前 N 次撤消的修改 | 同上                               |
| :white_check_mark: | U             | 恢复上一次修改过的行  |                                    |

## 外部命令

| 状态               | 命令        | 描述                                                  |
| ------------------ | ----------- | ----------------------------------------------------- |
| :white_check_mark: | :sh[ell]    | 开始一个 shell                                        |
| :white_check_mark: | :!{command} | 在 shell 中执行{command}                              |
| :arrow_down:       | K           | 使用'keyboard prg'程序在光标下查找关键字(默认: "man") |

## 执行范围

| 状态                      | 命令          | 描述                                           | 备注               |
| ------------------------- | ------------- | ---------------------------------------------- | ------------------ |
| :white_check_mark:        | ,             | 分隔两个行号                                   |                    |
| :white_check_mark: :star: | ;             | 同上，在解释第二个行之前将光标设置为第一个行号 | 光标移动不包括在内 |
| :white_check_mark:        | {number}      | 绝对行号                                       |                    |
| :white_check_mark:        | .             | 当前行                                         |                    |
| :white_check_mark:        | \$            | 当前文件的最后一行                             |                    |
| :white_check_mark:        | %             | 等价于 1,\$ (整个文件)                         |                    |
| :white_check_mark:        | \*            | 等价于'<,'> (可视区域)                         |                    |
| :white_check_mark:        | 't            | 标记 t 的位置                                  |                    |
| :arrow_down:              | /{pattern}[/] | 下一行中匹配{pattern}的地方                    |                    |
| :arrow_down:              | ?{pattern}[?] | 上一行中匹配{pattern}的地方                    |                    |
| :white_check_mark:        | +[num]        | 从前一行号中增加[number]（默认值：1）          |                    |
| :white_check_mark:        | -[num]        | 从前一行号中减去[number]（默认值：1）          |                    |

## 编辑文件

| 状态                      | 命令           | 描述         | 备注                                                             |
| ------------------------- | -------------- | ------------ | ---------------------------------------------------------------- |
| :white_check_mark: :star: | :e[dit] {file} | 编辑 {file}. | 将在当前分组编辑器的新选项卡中打开文件，而不是在当前选项卡中打开 |

## 多窗口命令

| 状态                      | 命令              | 描述                                              | 备注                                                                     |
| ------------------------- | ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| :white_check_mark: :star: | :e[dit] {file}    | 编辑 {file}.                                      | 将在当前分组编辑器的新选项卡中打开文件，而不是在当前选项卡中打开         |
| :white_check_mark: :star: | &lt;ctrl-w&gt; hl | 在窗口间进行切换                                  | 由于在 VSCode 中没有 Window 的概念，这些命令被映射成在分组编辑器之间切换 |
| :white_check_mark:        | :sp {file}        | 切分当前窗口                                      |                                                                          |
| :white_check_mark: :star: | :vsp {file}       | 将当前窗口在垂直切分                              |                                                                          |
| :white_check_mark:        | &lt;ctrl-w&gt; s  | 将当前窗口一分为二                                |                                                                          |
| :white_check_mark: :star: | &lt;ctrl-w&gt; v  | 垂直方向上将当前窗口一分为二                      |
| :white_check_mark:        | :new              | 水平方向上创建一个新的窗口,同时开始编辑一个空文件 |                                                                          |
| :white_check_mark: :star: | :vne[w]           | 垂直方向上创建一个新的窗口,同时开始编辑一个空文件 |                                                                          |

## 标签页

| 状态                      | 命令                                 | 描述                                                      | 备注                                               |
| ------------------------- | ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| :white_check_mark:        | :tabn[ext] :1234:                    | 转到下一个标签页或{count}指定的标签页,标签页序号从 1 开始 |                                                    |
| :white_check_mark:        | {count}&lt;C-PageDown&gt;, {count}gt | 同上                                                      |                                                    |
| :white_check_mark:        | :tabp[revious] :1234:                | 转上一个的标签页,在第一个到最后一个标签页间循环           |                                                    |
| :white_check_mark:        | :tabN[ext] :1234:                    | 同上                                                      |                                                    |
| :white_check_mark:        | {count}&lt;C-PageUp&gt;, {count}gT   | 同上                                                      |                                                    |
| :white_check_mark:        | :tabfir[st]                          | 跳转到当前窗口的第一个标签页                              |                                                    |
| :white_check_mark:        | :tabl[ast]                           | 跳转到当前窗口的最后一个标签页                            |                                                    |
| :white_check_mark:        | :tabe[dit] {file}                    | 在当前标签页之后打开一个新的标签页                        |                                                    |
| :arrow_down:              | :[count]tabe[dit], :[count]tabnew    | 同上                                                      | 不支持指定数量                                     |
| :white_check_mark:        | :tabnew {file}                       | 在当前标签页之后打开一个新的标签页                        |                                                    |
| :arrow_down:              | :[count]tab {cmd}                    | 执行{cmd}，当它打开一个新窗口时，打开一个新的标签页       |                                                    |
| :white_check_mark: :star: | :tabc[lose][!] :1234:                | 关闭当前标签页或关闭标签页{count}                         | VSCode 将会直接关闭并不会保存文件的修改            |
| :white_check_mark: :star: | :tabo[nly][!]                        | 关闭其它所有的标签页                                      | 不支持`!`, VSCode 将会直接关闭并不会保存文件的修改 |
| :white_check_mark:        | :tabm[ove][n]                        | 将当前的 tab 页移动到 tab 页 N 之后                       |                                                    |
| :arrow_down:              | :tabs                                | 列出选项卡页面及其包含的窗口                              | 可以使用 VSCode 内置的快捷方式: `cmd/ctrl+p`       |
| :arrow_down:              | :tabd[o] {cmd}                       | 在每一个标签页中执行{cmd}命令                             |                                                    |

## 折叠

### 折叠方法

可通过‘foldmethod’配置折叠方法。由于依赖于 VSCode 的折叠逻辑，尚不可用。

### 折叠命令

几乎所有和折叠相关的问题可以在这个[issue](https://github.com/VSCodeVim/Vim/issues/1004)中找到。

| 状态               | 命令                     | 描述                                                                            |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| :arrow_down:       | zf{motion} or {Visual}zf | 创建折叠                                                                        |
| :arrow_down:       | zF                       | 折叠[count]行. 类似于"zf".                                                      |
| :arrow_down:       | zd                       | 删除当前光标下的折叠内容                                                        |
| :arrow_down:       | zD                       | 递归删除当前光标下所有的折叠内容                                                |
| :arrow_down:       | zE                       | 打开窗口中所有的折叠内容                                                        |
| :white_check_mark: | zo                       | 打开光标下的折叠内容,当指定数量时,将打开多个折叠内容                            |
| :white_check_mark: | zO                       | 递归打开当前光标下所有的折叠内容                                                |
| :white_check_mark: | zc                       | 在光标下关闭一个折叠.当给出计数时，关闭多个折叠                                 |
| :white_check_mark: | zC                       | 递归关闭当前光标下所有的折叠内容                                                |
| :white_check_mark: | za                       | 处于关闭的折叠块时,打开折叠块.反之,关闭折叠块                                   |
| :arrow_down:       | zA                       | 处于关闭的折叠块时,递归的打开折叠块.反之,递归的关闭折叠块                       |
| :arrow_down:       | zv                       | 查看光标所在行：打开刚好足够的折叠，使光标所在行不折叠                          |
| :arrow_down:       | zx                       | 更新折叠：撤消手动打开和关闭折叠：重新应用'foldlevel'，然后执行“zv”：查看光标行 |
| :arrow_down:       | zX                       | 撤消手动打开和关闭折叠                                                          |
| :arrow_down:       | zm                       | 折叠更多：从'foldlevel'中减去一个                                               |
| :white_check_mark: | zM                       | 关闭所有的折叠: 将'foldlevel'设为 0. 将设置'foldenable'                         |
| :arrow_down:       | zr                       | 减少折叠：在'foldlevel'中添加一个                                               |
| :white_check_mark: | zR                       | 打开所有的折叠. 会将'foldlevel'调整到最高级.                                    |
| :arrow_down:       | zn                       | 不折叠: 重置'foldenable'. 所有的折叠都会打开                                    |
| :arrow_down:       | zN                       | 正常折叠：设置'foldenable'.所有折叠都将像以前一样.                              |
| :arrow_down:       | zi                       | 反转'foldenable'                                                                |
| :arrow_down:       | [z                       | 移动到当前打开的折叠块的首部                                                    |
| :arrow_down:       | ]z                       | 移动到当前打开的折叠块的尾部                                                    |
| :arrow_down:       | zj                       | 向下移动到下一个折叠的开始                                                      |
| :arrow_down:       | zk                       | 向上移动到上一个折叠的开始                                                      |

### 折叠配置

当前不支持任何折叠设置,请遵循 VSCode 的配置.
