import { operatorAuthorization } from '../../../../lib/operator-host'
import { OperatorAccessPanel } from './panel'
export const dynamic='force-dynamic'
export default async function OperatorAccessPage() {
  const authorization=await operatorAuthorization('operator:manage')
  return authorization.ok?<OperatorAccessPanel/>:<p className="text-slate-300">Platform administrator access required.</p>
}
