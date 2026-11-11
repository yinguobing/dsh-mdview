# 把 Markdown 写成一篇文章

这是**正文段落**，里面有 `inline code`、[一个链接](https://yinguobing.com)、*斜体*、~~删除线~~，还有一句比较长的话用来看看行尾折行和字间距是不是舒服——中文排版最容易被忽略的就是这一行读起来累不累。

## 列表与层级

- 第一项，长度普通
- 第二项，带一个**强调**和 `code`
- 第三项
  - 嵌套一层
  - 再一层
    - 最深一层
- [x] 已完成的任务
- [ ] 未完成的任务

1. 有序第一
2. 有序第二
3. 有序第三

### 图片

![相对路径图片](assets/test.png)

### 表格

| 项目 | 说明 | 数值 |
| --- | :--- | ---: |
| 渲染器 | 已就绪 | 1 |
| 语言包 | 按需加载 | 15 |
| 截图 | 浅色 / 深色 | 4 |

> 引用块第一段：用简单的话说复杂的问题。
>
> 引用块第二段，看看多段引用之间的间距。

#### 代码

```js
const marked = new Marked({ gfm: true, breaks: false })
marked.use({
  walkTokens(token) {
    if (token.type === 'image') token.href = resolveImage(token.href, documentPath)
  },
})
```

```bash
systemctl --user restart dsh-web.service
journalctl --user -u dsh-web.service -f
```

```python
def chunks(items: list, size: int = 10) -> list:
    return [items[i : i + size] for i in range(0, len(items), size)]
```

```text
纯文本代码块，不做高亮，只是等宽。
第二行。
```

##### 五级标题

正文最后一段。分隔线在下面。

---

结尾一句，看看 hr 的间距。
