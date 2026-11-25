import {csvHeaders,prepareImport,type ColumnMapping} from './recordings'

let text='', name=''
self.onmessage=async ({data}:MessageEvent<{file:File}|{mapping:ColumnMapping;volume?:number}>)=>{
  try {
    if('file' in data) {
      name=data.file.name
      text=await data.file.text()
      self.postMessage({cols:csvHeaders(text)})
    } else {
      self.postMessage({packet:prepareImport(text,name,data.mapping,data.volume)})
    }
  }catch(err){self.postMessage({error:err instanceof Error ? err.message : String(err)})}
}
