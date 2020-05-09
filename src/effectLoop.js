import {
  isTagNode,
  isComponentNode,
  isPrimitiveNode,
  ATTRIBUTE_NODE,
  CLASS_COMPONENT_NODE,
} from './brahmosNode';
import { callLifeCycle, insertBefore, getCurrentNode } from './utils';
import { runEffects } from './hooks';

import updateNodeAttributes from './updateAttribute';

/**
 * Updater to handle text node
 */
function updateTextNode(fiber) {
  const { part, node } = fiber;
  const { parentNode, previousSibling, nextSibling } = part;
  /**
   * get the last text node
   * As we always override the text node and don't change the position of
   * text node, Always send nextSibling as null to getCurrentNode
   * So we always pick the text node based on previousSibling
   * or parentNode (if prevSibling is null).
   */
  let textNode = getCurrentNode(parentNode, previousSibling, null);

  if (!textNode) {
    // add nodes at the right location
    textNode = insertBefore(parentNode, nextSibling, node);
  } else {
    // if we have text node just update the text node
    textNode.textContent = node;
  }

  return textNode;
}

function updateExistingNode(templateNode, part, oldPart, root) {
  // if it is not a part of array item, no need to rearrange
  if (!part.isArrayNode) return;

  const { domNodes } = templateNode;
  const { nodeIndex, parentNode, previousSibling } = part;
  const { nodeIndex: oldNodeIndex } = oldPart;

  // if the item position on last render and current render is same, no need to rearrange
  if (nodeIndex === oldNodeIndex) return;

  // if it is first item append it after the previous sibling or else append it after last rendered element.
  const appendAfter = nodeIndex === 0 ? previousSibling : root.lastArrayDOM;

  // get the element before which we have to add the new node
  const appendBefore = appendAfter ? appendAfter.nextSibling : parentNode.firstChild;

  // if there is dom node and it isn't in correct place rearrange the nodes
  const firstDOMNode = domNodes[0];
  if (
    firstDOMNode &&
    firstDOMNode.previousSibling !== appendAfter &&
    firstDOMNode !== appendBefore
  ) {
    insertBefore(parentNode, appendBefore, domNodes);
  }
}

function updateTagNode(fiber) {
  const {
    part,
    node: { templateNode },
    alternate,
    root,
  } = fiber;
  const { parentNode, nextSibling } = part;

  // if the alternate node is there rearrange the element if required, or else just add the new node
  if (alternate) {
    updateExistingNode(templateNode, part, alternate.part, root);
  } else {
    /**
     * when we add nodes first time
     * and we are rendering as fragment it means the fragment might have childNodes
     * which templateNode does not have, so for such cases we should reset nodeList on templateNode;
     */
    templateNode.domNodes = insertBefore(parentNode, nextSibling, templateNode.fragment);
  }

  root.lastArrayDOM = templateNode.domNodes[templateNode.domNodes.length - 1];
}

function handleComponentEffect(fiber) {
  const { node, root } = fiber;
  const { componentInstance, nodeType, prevProps, prevState } = node;

  if (nodeType === CLASS_COMPONENT_NODE) {
    node.lastSnapshot = callLifeCycle(componentInstance, 'getSnapshotBeforeUpdate', [
      prevProps,
      prevState,
    ]);
  }

  root.postCommitEffects.push(fiber);
}

function handleComponentPostCommitEffect(fiber) {
  const { node, alternate } = fiber;
  const { componentInstance, nodeType, prevProps, prevState, lastSnapshot } = node;

  if (nodeType === CLASS_COMPONENT_NODE) {
    // if it is first time rendered call componentDidMount or else call componentDidUpdate
    if (!alternate) {
      callLifeCycle(componentInstance, 'componentDidMount');
    } else {
      callLifeCycle(componentInstance, 'componentDidUpdate', [prevProps, prevState, lastSnapshot]);
    }
  } else {
    // call effects of functional component
    runEffects(componentInstance);
  }
}

function handleAttributeEffect(fiber) {
  const { part, node, alternate } = fiber;
  const { domNode } = part;
  const { attributes } = node;
  const oldAttributes = alternate && alternate.node.attributes;

  // TODO: Fix svg case
  updateNodeAttributes(domNode, attributes, oldAttributes, false);
}

export default function effectLoop(root) {
  let { nextEffect: fiber, postCommitEffects } = root;
  while (fiber) {
    const { node } = fiber;
    if (isPrimitiveNode(node)) {
      updateTextNode(fiber);
    } else if (isTagNode(node)) {
      updateTagNode(fiber);
      // TODO: Handle rearrange type of effect
    } else if (isComponentNode(node)) {
      handleComponentEffect(fiber);
    } else if (node.nodeType === ATTRIBUTE_NODE) {
      handleAttributeEffect(fiber);
    }

    const nextEffect = fiber.nextEffect;

    // reset effect key of that fiber.
    fiber.nextEffect = null;

    fiber = nextEffect;
  }

  // after applying the effects run all the post effects
  for (let i = postCommitEffects.length - 1; i >= 0; i--) {
    handleComponentPostCommitEffect(postCommitEffects[i]);
  }

  // once all effect has been processed update root's last effect node and reset lastArrayDOM and postCommitEffects
  root.lastEffectFiber = root;
  root.postCommitEffects = [];
  root.lastArrayDOM = null;
}
