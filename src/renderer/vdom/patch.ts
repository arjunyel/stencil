/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/snabbdom/snabbdom/blob/master/LICENSE
 *
 * Modified for Stencil's renderer and slot projection
 */
import * as d from '../../declarations';
import { Build } from '../../util/build-conditionals';
import { isDef } from '../../util/helpers';
import { loadHostContent } from './host-content';
import { NODE_TYPE, SSR_CHILD_ID, SSR_VNODE_ID } from '../../util/constants';
import { updateElement } from './update-dom-node';

let isSvgMode = false;


export function createRendererPatch(plt: d.PlatformApi, domApi: d.DomApi): d.RendererApi {
  // createRenderer() is only created once per app
  // the patch() function which createRenderer() returned is the function
  // which gets called numerous times by each component

  function createElm(vnode: d.VNode, parentElm: d.HostElement, childIndex: number, i?: number, elm?: any, childNode?: Node, namedSlot?: string, slotNodes?: Node[], hasLightDom?: boolean) {
    if (Build.slotPolyfill && !useNativeShadowDom && vnode.vtag === 'slot') {

      if (Object.keys(contentSlots).length) {
        if (scopeId) {
          domApi.$setAttribute(parentElm, scopeId + '-slot', '');
        }

        // special case for manually relocating host content nodes
        // to their new home in either a named slot or the default slot
        if (isDef(namedSlot = (vnode.vattrs && vnode.vattrs.name))) {
          // this vnode is a named slot
          slotNodes = contentSlots[namedSlot];

        } else {
          // this vnode is the default slot
          slotNodes = contentSlots.$defaultSlot;
        }

        if (isDef(slotNodes)) {
          // the host element has some nodes that need to be moved around

          // we have a slot for the user's vnode to go into
          // while we're moving nodes around, temporarily disable
          // the disconnectCallback from working
          plt.tmpDisconnected = true;

          for (i = 0; i < slotNodes.length; i++) {
            childNode = slotNodes[i];
            // remove the host content node from it's original parent node
            // then relocate the host content node to its new slotted home
            domApi.$remove(childNode);
            domApi.$appendChild(
              parentElm,
              childNode
            );

            if (childNode.nodeType !== NODE_TYPE.CommentNode) {
              hasLightDom = true;
            }
          }

          if (!hasLightDom && vnode.vchildren) {
            // the user did not provide light-dom content
            // and this vnode does come with it's own default content
            updateChildren(parentElm, [], vnode.vchildren);
          }

          // done moving nodes around
          // allow the disconnect callback to work again
          plt.tmpDisconnected = false;
        }
      }

      // this was a slot node, we do not create slot elements, our work here is done
      // no need to return any element to be added to the dom
      return null;
    }

    if (isDef(vnode.vtext)) {
      // create text node
      vnode.elm = domApi.$createTextNode(vnode.vtext);

    } else {
      // create element
      elm = vnode.elm = ((Build.hasSvg && (isSvgMode || vnode.vtag === 'svg')) ? domApi.$createElementNS('http://www.w3.org/2000/svg', vnode.vtag) : domApi.$createElement(vnode.vtag));

      if (Build.hasSvg) {
        isSvgMode = vnode.vtag === 'svg' ? true : (vnode.vtag === 'foreignObject' ? false : isSvgMode);
      }

      // add css classes, attrs, props, listeners, etc.
      updateElement(plt, null, vnode, isSvgMode);

      if (isDef(scopeId) && elm._scopeId !== scopeId) {
        // if there is a scopeId and this is the initial render
        // then let's add the scopeId as an attribute
        domApi.$setAttribute(elm, (elm._scopeId = scopeId), '');
      }

      const children = vnode.vchildren;

      if (Build.ssrServerSide && isDef(ssrId)) {
        // SSR ONLY: this is an SSR render and this
        // logic does not run on the client

        // give this element the SSR child id that can be read by the client
        domApi.$setAttribute(
          elm,
          SSR_CHILD_ID,
          ssrId + '.' + childIndex + (hasChildNodes(children) ? '' : '.')
        );
      }

      if (children) {
        for (i = 0; i < children.length; ++i) {
          // create the node
          childNode = createElm(children[i], elm, i);

          // return node could have been null
          if (childNode) {
            if (Build.ssrServerSide && isDef(ssrId) && childNode.nodeType === NODE_TYPE.TextNode) {
              // SSR ONLY: add the text node's start comment
              domApi.$appendChild(elm, domApi.$createComment('s.' + ssrId + '.' + i));
            }

            // append our new node
            domApi.$appendChild(elm, childNode);

            if (Build.ssrServerSide && isDef(ssrId) && childNode.nodeType === 3) {
              // SSR ONLY: add the text node's end comment
              domApi.$appendChild(elm, domApi.$createComment('/'));
              domApi.$appendChild(elm, domApi.$createTextNode(' '));
            }
          }
        }
      }

      if (Build.hasSvg) {
        // Only reset the SVG context when we're exiting SVG element
        if (vnode.vtag === 'svg') {
          isSvgMode = false;
        }
      }
    }

    return vnode.elm;
  }

  function addVnodes(parentElm: d.HostElement, before: Node, vnodes: d.VNode[], startIdx: number, endIdx: number, containerElm?: Node, childNode?: Node, vnodeChild?: d.VNode) {
    // $defaultHolder deprecated 2018-04-02
    const contentRef = parentElm['s-cr'] || (parentElm as any)['$defaultHolder'];
    containerElm = (contentRef && domApi.$parentNode(contentRef)) || parentElm;

    for (; startIdx <= endIdx; ++startIdx) {
      vnodeChild = vnodes[startIdx];

      if (vnodeChild) {
        childNode = isDef(vnodeChild.vtext) ? domApi.$createTextNode(vnodeChild.vtext) : createElm(vnodeChild, parentElm, startIdx);

        if (childNode) {
          vnodeChild.elm = childNode;
          domApi.$insertBefore(containerElm, childNode, before);
        }
      }
    }
  }

  function removeVnodes(vnodes: d.VNode[], startIdx: number, endIdx: number) {
    for (; startIdx <= endIdx; ++startIdx) {
      if (isDef(vnodes[startIdx])) {
        domApi.$remove(vnodes[startIdx].elm);
      }
    }
  }

  function updateChildren(parentElm: d.HostElement, oldCh: d.VNode[], newCh: d.VNode[]) {
    let oldStartIdx = 0, newStartIdx = 0;
    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];
    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];
    let oldKeyToIdx: any;
    let idxInOld: number;
    let elmToMove: d.VNode;
    let node: Node;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVnode == null) {
         // Vnode might have been moved left
        oldStartVnode = oldCh[++oldStartIdx];

      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx];

      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx];

      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx];

      } else if (isSameVnode(oldStartVnode, newStartVnode)) {
        patchVNode(oldStartVnode, newStartVnode);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];

      } else if (isSameVnode(oldEndVnode, newEndVnode)) {
        patchVNode(oldEndVnode, newEndVnode);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];

      } else if (isSameVnode(oldStartVnode, newEndVnode)) {
        // Vnode moved right
        patchVNode(oldStartVnode, newEndVnode);
        domApi.$insertBefore(parentElm, oldStartVnode.elm, domApi.$nextSibling(oldEndVnode.elm));
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];

      } else if (isSameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left
        patchVNode(oldEndVnode, newStartVnode);
        domApi.$insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];

      } else {
        if (!isDef(oldKeyToIdx)) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }

        idxInOld = oldKeyToIdx[newStartVnode.vkey];

        if (!isDef(idxInOld)) {
          // new element
          node = createElm(newStartVnode, parentElm, newStartIdx);
          newStartVnode = newCh[++newStartIdx];

        } else {
          elmToMove = oldCh[idxInOld];

          if (elmToMove.vtag !== newStartVnode.vtag) {
            node = createElm(newStartVnode, parentElm, idxInOld);

          } else {
            patchVNode(elmToMove, newStartVnode);
            oldCh[idxInOld] = undefined;
            node = elmToMove.elm;
          }

          newStartVnode = newCh[++newStartIdx];
        }

        if (node) {
          domApi.$insertBefore((oldStartVnode.elm && oldStartVnode.elm.parentNode) || parentElm, node, oldStartVnode.elm);
        }
      }
    }

    if (oldStartIdx > oldEndIdx) {
      addVnodes(parentElm,
                (newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm),
                newCh, newStartIdx, newEndIdx);

    } else if (newStartIdx > newEndIdx) {
      removeVnodes(oldCh, oldStartIdx, oldEndIdx);
    }
  }

  function isSameVnode(vnode1: d.VNode, vnode2: d.VNode) {
    // compare if two vnode to see if they're "technically" the same
    // need to have the same element tag, and same key to be the same
    return vnode1.vtag === vnode2.vtag && vnode1.vkey === vnode2.vkey;
  }

  function createKeyToOldIdx(children: d.VNode[], beginIdx: number, endIdx: number) {
    const map: {[key: string]: number} = {};
    let i: number, key: any, ch;

    for (i = beginIdx; i <= endIdx; ++i) {
      ch = children[i];
      if (ch != null) {
        key = ch.vkey;
        if (key !== undefined) {
          map.k = i;
        }
      }
    }

    return map;
  }

  function patchVNode(oldVNode: d.VNode, newVNode: d.VNode, defaultHolder?: Comment) {
    const elm: d.HostElement = newVNode.elm = <any>oldVNode.elm;
    const oldChildren = oldVNode.vchildren;
    const newChildren = newVNode.vchildren;

    if (Build.hasSvg) {
      // test if we're rendering an svg element, or still rendering nodes inside of one
      // only add this to the when the compiler sees we're using an svg somewhere
      isSvgMode = newVNode.elm && isDef(domApi.$parentElement(newVNode.elm)) && (newVNode.elm as SVGElement).ownerSVGElement !== undefined;
      isSvgMode = newVNode.vtag === 'svg' ? true : (newVNode.vtag === 'foreignObject' ? false : isSvgMode);
    }

    if (!isDef(newVNode.vtext)) {
      // element node

      if (newVNode.vtag !== 'slot') {
        // either this is the first render of an element OR it's an update
        // AND we already know it's possible it could have changed
        // this updates the element's css classes, attrs, props, listeners, etc.
        updateElement(plt, oldVNode, newVNode, isSvgMode);
      }

      if (isDef(oldChildren) && isDef(newChildren)) {
        // looks like there's child vnodes for both the old and new vnodes
        updateChildren(elm, oldChildren, newChildren);

      } else if (isDef(newChildren)) {
        // no old child vnodes, but there are new child vnodes to add
        if (isDef(oldVNode.vtext)) {
          // the old vnode was text, so be sure to clear it out
          domApi.$setTextContent(elm, '');
        }
        // add the new vnode children
        addVnodes(elm, null, newChildren, 0, newChildren.length - 1);

      } else if (isDef(oldChildren)) {
        // no new child vnodes, but there are old child vnodes to remove
        removeVnodes(oldChildren, 0, oldChildren.length - 1);
      }

    } else if (Build.slotPolyfill && (defaultHolder = (elm['s-cr'] || (elm as any)['$defaultHolder']/* $defaultHolder deprecated 2018-04-02 */))) {
      // this element has slotted content
      domApi.$setTextContent(domApi.$parentNode(defaultHolder), newVNode.vtext);

    } else if (oldVNode.vtext !== newVNode.vtext) {
      // update the text content for the text only vnode
      // and also only if the text is different than before
      domApi.$setTextContent(elm, newVNode.vtext);
    }

    if (Build.hasSvg) {
      // reset svgMode when svg node is fully patched
      if (isSvgMode && 'svg' === newVNode.vtag) {
        isSvgMode = false;
      }
    }
  }

  // internal variables to be reused per patch() call
  let contentRef: Comment,
      contentSlots: d.ContentSlots,
      useNativeShadowDom: boolean,
      ssrId: number,
      scopeId: string;


  return function patch(oldVNode: d.VNode, newVNode: d.VNode, isUpdate?: boolean, encapsulation?: d.Encapsulation, ssrPatchId?: number) {
    // patchVNode() is synchronous
    // so it is safe to set these variables and internally
    // the same patch() call will reference the same data

    if (Build.ssrServerSide) {
      if (encapsulation !== 'shadow') {
        ssrId = ssrPatchId;
      } else {
        ssrId = null;
      }
    }

    if (Build.slotPolyfill) {
      // get the host content reference comment node
      contentRef = (oldVNode.elm as d.HostElement)['s-cr'];

      // collect the host content nodes and and shots
      loadHostContent(domApi, contentRef, (contentSlots = {}));

      // get the scopeId
      scopeId = (encapsulation === 'scoped' || (encapsulation === 'shadow' && !domApi.$supportsShadowDom)) ? 'data-' + domApi.$tagName(oldVNode.elm) : null;
    }

    if (Build.shadowDom) {
      // use native shadow dom only if the component wants to use it
      // and if this browser supports native shadow dom
      useNativeShadowDom = (encapsulation === 'shadow' && domApi.$supportsShadowDom);
    }

    if (!isUpdate) {
      if (Build.shadowDom && useNativeShadowDom) {
        // this component SHOULD use native slot/shadow dom
        // this browser DOES support native shadow dom
        // and this is the first render
        // let's create that shadow root
        oldVNode.elm = domApi.$attachShadow(oldVNode.elm, { mode: 'open' });

      } else if (Build.slotPolyfill && scopeId) {
        // this host element should use scoped css
        // add the scope attribute to the host
        domApi.$setAttribute(oldVNode.elm, scopeId + '-host', '');
      }
    }

    // synchronous patch
    patchVNode(oldVNode, newVNode);

    if (Build.ssrServerSide && isDef(ssrId)) {
      // SSR ONLY: we've been given an SSR id, so the host element
      // should be given the ssr id attribute
      domApi.$setAttribute(oldVNode.elm, SSR_VNODE_ID, ssrId);
    }

    // return our new vnode
    return newVNode;
  };
}


export function callNodeRefs(vNode: d.VNode, isDestroy?: boolean) {
  if (vNode) {
    vNode.vattrs && vNode.vattrs.ref && vNode.vattrs.ref(isDestroy ? null : vNode.elm);

    vNode.vchildren && vNode.vchildren.forEach(vChild => {
      callNodeRefs(vChild, isDestroy);
    });
  }
}


function hasChildNodes(children: d.VNode[]) {
  // SSR ONLY: check if there are any more nested child elements
  // if there aren't, this info is useful so the client runtime
  // doesn't have to climb down and check so many elements
  if (children) {
    for (var i = 0; i < children.length; i++) {
      if (children[i].vtag !== 'slot' || hasChildNodes(children[i].vchildren)) {
        return true;
      }
    }
  }
  return false;
}
