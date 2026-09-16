export function operatorMutationHeaders(reason?:string,cookie=typeof document==='undefined'?'':document.cookie):Record<string,string> {
  const headers:Record<string,string>={ 'content-type':'application/json' }
  const csrf=cookie.match(/(?:^|;\s*)vectalon_operator_csrf=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1]
  if (csrf) headers['x-vectalon-csrf']=csrf
  if (reason) headers['x-vectalon-reason']=reason
  return headers
}
