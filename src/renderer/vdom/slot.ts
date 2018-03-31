import { DomApi, HostElement, PlatformApi } from '../../declarations';


export function initHostContent(plt: PlatformApi, domApi: DomApi, elm: HostElement, childNodes: NodeList, contentRef?: Comment) {

  if (!plt.contentRefMap.has(elm)) {
    // create a comment to represent where the original
    // content was first placed, which is useful later on
    plt.contentRefMap.set(elm, contentRef = domApi.$createComment(''));
    domApi.$insertBefore(elm, contentRef, childNodes[0]);
  }

}
