import { dict, str } from '../../lib/coerce'
import { Markdown } from '../Markdown'

interface Props {
  payload: unknown
}

/** 兜底渲染器：任何文本都能被看到；实在认不出来就显示原始结构。 */
export function TextRenderer({ payload }: Props) {
  if (typeof payload === 'string') {
    return (
      <div className="text-block">
        <Markdown source={payload} />
      </div>
    )
  }

  const data = dict(payload)
  const source = str(data.markdown) || str(data.text)
  if (source) {
    return (
      <div className="text-block">
        <Markdown source={source} />
      </div>
    )
  }

  return (
    <div className="text-block">
      <p className="text-block__note">这个结果没有可读文本，以下是原始内容：</p>
      <pre className="raw">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  )
}
