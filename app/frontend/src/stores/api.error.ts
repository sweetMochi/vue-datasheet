import type { HTTPErrorResponse, HTTPValidationError } from './api.type'

/**
 * 回傳 body 無法解析時，依狀態碼提供的預設訊息
 */
const STATUS_MSG: { [key: number]: string } = {
  404: '找不到這份文件',
  413: '檔案太大，請上傳 20 MB 以下的檔案',
  502: '伺服器暫時無法連線',
  503: '伺服器暫時無法連線',
  504: '伺服器回應逾時',
}

/**
 * 讀取後端回傳的 detail，無法解析時回傳 undefined
 */
async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const { detail } = JSON.parse(await response.text()) as {
      detail?: HTTPErrorResponse['detail'] | HTTPValidationError['detail']
    }

    // FastAPI HTTPException 的 detail 為字串，如 404、400
    if (typeof detail === 'string') {
      return detail
    }

    // FastAPI 驗證錯誤的 detail 為陣列
    if (Array.isArray(detail) && detail.length) {
      return detail.map((e) => `${e.loc.at(-1)}：${e.msg}`).join('、')
    }
  } catch {
    // body 不是 JSON（例如 nginx 的 HTML 錯誤頁），改用預設訊息
  }
  return undefined
}

/**
 * 取得錯誤訊息，優先使用後端的 detail
 * 無法解析時依狀態碼提供預設訊息
 */
export async function readErrorMsg(response: Response): Promise<string> {
  return (await readDetail(response)) ?? STATUS_MSG[response.status] ?? `HTTP ${response.status}`
}
